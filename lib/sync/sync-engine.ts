import {
  collection,
  doc,
  getDocs,
  runTransaction,
  setDoc,
} from "firebase/firestore";

import { firestore } from "@/lib/firebase";

import type {
  NexoraDatabase,
  Product,
  Movement,
  SyncDeletion,
} from "@/lib/database/db";

type CloudProduct = Omit<
  Product,
  "id" | "quantity" | "syncStatus"
>;

type CloudMovement = Omit<
  Movement,
  "id" | "productId" | "syncStatus"
>;

type CloudDeletion = Omit<
  SyncDeletion,
  "id" | "syncStatus"
>;

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

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return Promise.resolve();
  }

  const existing = activeSyncs.get(uid);
  if (existing) return existing;

  const promise = syncDeletions(uid, db)
    .then(() => syncProducts(uid, db))
    .then(() => syncMovements(uid, db))
    .then(() => recalculateAllProductStocks(db))
    .finally(() => {
      activeSyncs.delete(uid);
    });

  activeSyncs.set(uid, promise);

  return promise;
}

// ==========================================
// OUTILS DE SUPPRESSION
// ==========================================

async function isDeleted(
  db: NexoraDatabase,
  syncId: string,
  entityType: "product" | "movement"
): Promise<boolean> {
  const deletion = await db.syncDeletions
    .where("syncId")
    .equals(syncId)
    .first();

  return deletion?.entityType === entityType;
}

async function applyRemoteDeletion(
  db: NexoraDatabase,
  deletion: CloudDeletion
): Promise<void> {
  await db.transaction(
    "rw",
    db.products,
    db.movements,
    db.syncDeletions,
    async () => {
      const existingDeletion = await db.syncDeletions
        .where("syncId")
        .equals(deletion.syncId)
        .first();

      // Éviter un conflit d'index unique avec le hook Dexie.
      if (existingDeletion?.id !== undefined) {
        await db.syncDeletions.delete(existingDeletion.id);
      }

      if (deletion.entityType === "product") {
        const product = await db.products
          .where("syncId")
          .equals(deletion.syncId)
          .first();

        if (product?.id !== undefined) {
          // Les mouvements associés ne sont pas supprimés.
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

      // Conserver le marqueur de suppression.
      const generatedDeletion = await db.syncDeletions
        .where("syncId")
        .equals(deletion.syncId)
        .first();

      const record: SyncDeletion = {
        ...deletion,
        syncStatus: "synced",
      };

      if (generatedDeletion?.id !== undefined) {
        await db.syncDeletions.put({
          ...record,
          id: generatedDeletion.id,
        });
      } else {
        await db.syncDeletions.add(record);
      }
    }
  );
}

// ==========================================
// SYNCHRONISATION DES SUPPRESSIONS
// ==========================================

async function syncDeletions(
  uid: string,
  db: NexoraDatabase
): Promise<void> {
  const deletionsRef = collection(
    firestore,
    "users",
    uid,
    "syncDeletions"
  );

  // 1. Envoyer les suppressions locales.
  const pending = await db.syncDeletions
    .where("syncStatus")
    .equals("pending")
    .toArray();

  for (const deletion of pending) {
    if (!deletion.syncId || deletion.id === undefined) {
      continue;
    }

    const {
      id,
      syncStatus,
      ...cloudDeletion
    } = deletion;

    const deletionRef = doc(
      deletionsRef,
      deletion.syncId
    );

    await setDoc(deletionRef, cloudDeletion);

    const current = await db.syncDeletions
      .where("syncId")
      .equals(deletion.syncId)
      .first();

    if (
      current?.id !== undefined &&
      current.deletedAt === deletion.deletedAt
    ) {
      await db.syncDeletions.update(current.id, {
        syncStatus: "synced",
      });
    }
  }

  // 2. Récupérer les suppressions distantes.
  const remoteDeletions = await getDocs(deletionsRef);

  for (const remoteDoc of remoteDeletions.docs) {
    const remote = remoteDoc.data();

    if (
      remote.entityType !== "product" &&
      remote.entityType !== "movement"
    ) {
      console.warn(
        "[Nexora Sync] Suppression distante invalide ignorée.",
        remoteDoc.id
      );
      continue;
    }

    const deletion: CloudDeletion = {
      syncId: remoteDoc.id,
      entityType: remote.entityType,
      deletedAt:
        typeof remote.deletedAt === "string"
          ? remote.deletedAt
          : new Date().toISOString(),
    };

    await applyRemoteDeletion(db, deletion);
  }
}

// ==========================================
// SYNCHRONISATION DES PRODUITS
// ==========================================

async function syncProducts(
  uid: string,
  db: NexoraDatabase
): Promise<void> {
  const productsRef = collection(
    firestore,
    "users",
    uid,
    "products"
  );

  const pending = await db.products
    .where("syncStatus")
    .equals("pending")
    .toArray();

  // Envoyer les produits locaux.
  for (const product of pending) {
    if (!product.syncId || product.id === undefined) continue;

    if (await isDeleted(db, product.syncId, "product")) {
      continue;
    }

    const productRef = doc(productsRef, product.syncId);

    const {
      id,
      quantity,
      syncStatus,
      ...cloudProduct
    } = product;

    const result = await runTransaction(
      firestore,
      async (transaction) => {
        const snapshot = await transaction.get(productRef);

        if (snapshot.exists()) {
          const remote = snapshot.data();

          const localDate = product.updatedAt || "";
          const remoteDate = remote.updatedAt || "";

          if (remoteDate > localDate) {
            return {
              accepted: false,
              remote,
            };
          }
        }

        transaction.set(productRef, cloudProduct);

        return {
          accepted: true,
          remote: null,
        };
      }
    );

    if (result.accepted) {
      const current = await db.products.get(id);

      if (current?.updatedAt === product.updatedAt) {
        await db.products.update(id, {
          syncStatus: "synced",
        });
      }
    } else if (result.remote) {
      const current = await db.products.get(id);

      if (current) {
        await db.products.update(id, {
          name: result.remote.name,
          sku: result.remote.sku,
          category: result.remote.category,
          description: result.remote.description,
          purchasePrice: result.remote.purchasePrice,
          salePrice: result.remote.salePrice,
          minStock: result.remote.minStock,
          initialQuantity: result.remote.initialQuantity,
          updatedAt: result.remote.updatedAt,
          syncStatus: "synced",
        });
      }
    }
  }

  // Télécharger les produits distants.
  const remoteProducts = await getDocs(productsRef);

  for (const remoteDoc of remoteProducts.docs) {
    if (await isDeleted(db, remoteDoc.id, "product")) {
      continue;
    }

    const remote = remoteDoc.data() as CloudProduct;

    const local = await db.products
      .where("syncId")
      .equals(remoteDoc.id)
      .first();

    if (local?.syncStatus === "pending") continue;

    const productData: Omit<Product, "id"> = {
      ...remote,
      syncId: remoteDoc.id,
      syncStatus: "synced",
      quantity: local?.quantity ?? remote.initialQuantity,
    };

    if (local?.id !== undefined) {
      await db.products.put({
        ...productData,
        id: local.id,
      });
    } else {
      await db.products.add(productData);
    }
  }
}

// ==========================================
// SYNCHRONISATION DES MOUVEMENTS
// ==========================================

async function syncMovements(
  uid: string,
  db: NexoraDatabase
): Promise<void> {
  const movementsRef = collection(
    firestore,
    "users",
    uid,
    "movements"
  );

  // 1. Envoyer les mouvements locaux.
  const pending = await db.movements
    .where("syncStatus")
    .equals("pending")
    .toArray();

  for (const movement of pending) {
    if (!movement.syncId || movement.id === undefined) continue;

    if (await isDeleted(db, movement.syncId, "movement")) {
      continue;
    }

    if (!movement.productSyncId) {
      console.warn(
        "[Nexora Sync] Mouvement ignoré : productSyncId manquant.",
        movement
      );
      continue;
    }

    const {
      id,
      productId,
      syncStatus,
      ...cloudMovement
    } = movement;

    const movementRef = doc(
      movementsRef,
      movement.syncId
    );

    await setDoc(
      movementRef,
      cloudMovement as CloudMovement
    );

    const current = await db.movements.get(id);

    if (current?.syncId === movement.syncId) {
      await db.movements.update(id, {
        syncStatus: "synced",
      });
    }
  }

  // 2. Télécharger les mouvements distants.
  const remoteMovements = await getDocs(movementsRef);

  for (const remoteDoc of remoteMovements.docs) {
    if (await isDeleted(db, remoteDoc.id, "movement")) {
      continue;
    }

    const remote = remoteDoc.data() as CloudMovement;

    if (
      !remote.productSyncId ||
      (remote.type !== "ENTREE" && remote.type !== "SORTIE") ||
      !Number.isInteger(remote.quantity) ||
      remote.quantity <= 0
    ) {
      console.warn(
        "[Nexora Sync] Mouvement distant invalide ignoré.",
        remoteDoc.id
      );
      continue;
    }

    const product = await db.products
      .where("syncId")
      .equals(remote.productSyncId)
      .first();

    // Le mouvement reste récupérable même si le produit
    // a été supprimé localement.
    const localProductId = product?.id ?? 0;

    const existing = await db.movements
      .where("syncId")
      .equals(remoteDoc.id)
      .first();

    if (existing) {
      if (
        existing.syncStatus === "pending" &&
        existing.id !== undefined
      ) {
        await db.movements.update(existing.id, {
          syncStatus: "synced",
        });
      }

      continue;
    }

    await db.movements.add({
      ...remote,
      syncId: remoteDoc.id,
      syncStatus: "synced",
      productId: localProductId,
    });
  }
}

// ==========================================
// RECALCUL DES STOCKS
// ==========================================

async function recalculateAllProductStocks(
  db: NexoraDatabase
): Promise<void> {
  const [products, movements] = await Promise.all([
    db.products.toArray(),
    db.movements.toArray(),
  ]);

  const productIdToSyncId = new Map<number, string>();
  const netMovements = new Map<string, number>();

  for (const product of products) {
    if (product.id !== undefined && product.syncId) {
      productIdToSyncId.set(
        product.id,
        product.syncId
      );
    }
  }

  for (const movement of movements) {
    const productSyncId =
      movement.productSyncId ||
      productIdToSyncId.get(movement.productId);

    if (!productSyncId) continue;

    const variation =
      movement.type === "ENTREE"
        ? movement.quantity
        : -movement.quantity;

    netMovements.set(
      productSyncId,
      (netMovements.get(productSyncId) || 0) + variation
    );
  }

  for (const product of products) {
    if (product.id === undefined || !product.syncId) continue;

    const initialQuantity = product.initialQuantity ?? 0;

    const netMovement =
      netMovements.get(product.syncId) || 0;

    const calculatedQuantity =
      initialQuantity + netMovement;

    if (product.quantity === calculatedQuantity) continue;

    await db.products.update(product.id, {
      quantity: calculatedQuantity,
      syncStatus: product.syncStatus || "synced",
    });
  }
}