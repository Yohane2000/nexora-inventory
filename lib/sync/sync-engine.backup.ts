import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
} from "firebase/firestore";

import { firestore } from "@/lib/firebase";

import type {
  NexoraDatabase,
  Product,
  Movement,
  SyncDeletion,
} from "@/lib/database/db";

// --------------------------------------------------
// TYPES
// --------------------------------------------------

type CloudProduct = Omit<Product, "id">;

type CloudMovement = Omit<Movement, "id" | "productId">;

type CloudDeletion = {
  syncId: string;
  entityType: "product" | "movement";
  deletedAt: string;
};

// --------------------------------------------------
// VERROU POUR ÉVITER LES SYNCHRONISATIONS SIMULTANÉES
// --------------------------------------------------

const activeSyncs = new Map<string, Promise<void>>();

export function syncUserData(
  uid: string,
  db: NexoraDatabase
): Promise<void> {
  if (!uid) {
    return Promise.reject(
      new Error("Utilisateur Firebase non identifié.")
    );
  }

  const existingSync = activeSyncs.get(uid);

  if (existingSync) {
    return existingSync;
  }

  const syncPromise = runSync(uid, db).finally(() => {
    activeSyncs.delete(uid);
  });

  activeSyncs.set(uid, syncPromise);

  return syncPromise;
}

// --------------------------------------------------
// SYNCHRONISATION PRINCIPALE
// --------------------------------------------------

async function runSync(
  uid: string,
  db: NexoraDatabase
): Promise<void> {
  if (!navigator.onLine) {
    return;
  }

  const userRef = collection(firestore, "users", uid, "products");
  const movementRef = collection(firestore, "users", uid, "movements");
  const deletionRef = collection(firestore, "users", uid, "deletions");

  // 1. RÉCUPÉRER LES SUPPRESSIONS DISTANTES

  const remoteDeletions = await getDocs(deletionRef);

  for (const remoteDoc of remoteDeletions.docs) {
    const deletion = remoteDoc.data() as CloudDeletion;

    if (deletion.entityType === "product") {
      const product = await db.products
        .where("syncId")
        .equals(deletion.syncId)
        .first();

      if (product?.id !== undefined) {
        await db.products.delete(product.id);
      }
    }

    if (deletion.entityType === "movement") {
      const movement = await db.movements
        .where("syncId")
        .equals(deletion.syncId)
        .first();

      if (movement?.id !== undefined) {
        await db.movements.delete(movement.id);
      }
    }

    const localDeletion = await db.syncDeletions
      .where("syncId")
      .equals(deletion.syncId)
      .first();

    if (localDeletion?.id !== undefined) {
      await db.syncDeletions.delete(localDeletion.id);
    }
  }

  // 2. ENVOYER LES SUPPRESSIONS LOCALES

  const localDeletions = await db.syncDeletions
    .where("syncStatus")
    .equals("pending")
    .toArray();

  for (const deletion of localDeletions) {
    await setDoc(
      doc(deletionRef, deletion.syncId),
      {
        syncId: deletion.syncId,
        entityType: deletion.entityType,
        deletedAt: deletion.deletedAt,
      }
    );

    const targetCollection =
      deletion.entityType === "product"
        ? userRef
        : movementRef;

    await deleteDoc(doc(targetCollection, deletion.syncId));

    if (deletion.id !== undefined) {
      await db.syncDeletions.update(deletion.id, {
        syncStatus: "synced",
      });
    }
  }

  // 3. ENVOYER LES PRODUITS EN ATTENTE

  const pendingProducts = await db.products
    .where("syncStatus")
    .equals("pending")
    .toArray();

  for (const product of pendingProducts) {
    if (!product.syncId) continue;

    const { id, ...cloudProduct } = product;

    await setDoc(
      doc(userRef, product.syncId),
      cloudProduct
    );

    const current = await db.products.get(product.id!);

    if (
      current &&
      current.updatedAt === product.updatedAt
    ) {
      await db.products.update(product.id!, {
        syncStatus: "synced",
      });
    }
  }

  // 4. ENVOYER LES MOUVEMENTS EN ATTENTE

  const pendingMovements = await db.movements
    .where("syncStatus")
    .equals("pending")
    .toArray();

  for (const movement of pendingMovements) {
    if (!movement.syncId) continue;

    const {
      id,
      productId,
      ...cloudMovement
    } = movement;

    await setDoc(
      doc(movementRef, movement.syncId),
      cloudMovement
    );

    const current = await db.movements.get(movement.id!);

    if (
      current &&
      current.updatedAt === movement.updatedAt
    ) {
      await db.movements.update(movement.id!, {
        syncStatus: "synced",
      });
    }
  }

  // 5. RÉCUPÉRER LES PRODUITS DISTANTS

  const remoteProducts = await getDocs(userRef);

  for (const remoteDoc of remoteProducts.docs) {
    const remoteProduct = remoteDoc.data() as CloudProduct;

    const localProduct = await db.products
      .where("syncId")
      .equals(remoteDoc.id)
      .first();

    if (
      localProduct?.syncStatus === "pending" &&
      localProduct.updatedAt > remoteProduct.updatedAt
    ) {
      continue;
    }

    const productData: Product = {
      ...remoteProduct,
      syncId: remoteDoc.id,
      syncStatus: "synced",
    };

    if (localProduct?.id !== undefined) {
      await db.products.put({
        ...productData,
        id: localProduct.id,
      });
    } else {
      await db.products.add(productData);
    }

    const savedProduct = await db.products
      .where("syncId")
      .equals(remoteDoc.id)
      .first();

    if (savedProduct?.id !== undefined) {
      await db.products.update(savedProduct.id, {
        syncStatus: "synced",
      });
    }
  }

  // 6. RÉCUPÉRER LES MOUVEMENTS DISTANTS

  const remoteMovements = await getDocs(movementRef);

  for (const remoteDoc of remoteMovements.docs) {
    const remoteMovement = remoteDoc.data() as CloudMovement;

    const localMovement = await db.movements
      .where("syncId")
      .equals(remoteDoc.id)
      .first();

    if (
      localMovement?.syncStatus === "pending" &&
      localMovement.updatedAt &&
      remoteMovement.updatedAt &&
      localMovement.updatedAt > remoteMovement.updatedAt
    ) {
      continue;
    }

    const product = await db.products
      .where("syncId")
      .equals(remoteMovement.productSyncId || "")
      .first();

    if (!product?.id) {
      continue;
    }

    const movementData: Movement = {
      ...remoteMovement,
      syncId: remoteDoc.id,
      productId: product.id,
      productSyncId: remoteMovement.productSyncId,
      syncStatus: "synced",
    };

    if (localMovement?.id !== undefined) {
      await db.movements.put({
        ...movementData,
        id: localMovement.id,
      });
    } else {
      await db.movements.add(movementData);
    }

    const savedMovement = await db.movements
      .where("syncId")
      .equals(remoteDoc.id)
      .first();

    if (savedMovement?.id !== undefined) {
      await db.movements.update(savedMovement.id, {
        syncStatus: "synced",
      });
    }
  }
}