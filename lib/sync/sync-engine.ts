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
} from "@/lib/database/db";

type CloudProduct = Omit<
  Product,
  "id" | "quantity" | "syncStatus"
>;

type CloudMovement = Omit<
  Movement,
  "id" | "productId" | "syncStatus"
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

  const promise = syncProducts(uid, db)
    .then(() => syncMovements(uid, db))
    .then(() => recalculateAllProductStocks(db))
    .finally(() => {
      activeSyncs.delete(uid);
    });

  activeSyncs.set(uid, promise);
  return promise;
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

  // Récupérer les produits distants.
  const remoteProducts = await getDocs(productsRef);

  for (const remoteDoc of remoteProducts.docs) {
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

  // 1. Envoyer les mouvements locaux en attente.
  const pending = await db.movements
    .where("syncStatus")
    .equals("pending")
    .toArray();

  for (const movement of pending) {
    if (!movement.syncId || movement.id === undefined) continue;

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

    // Le même syncId désigne toujours le même mouvement.
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

    if (!product || product.id === undefined) continue;

    const existing = await db.movements
      .where("syncId")
      .equals(remoteDoc.id)
      .first();

    if (existing) {
      // Ne jamais recréer un mouvement déjà présent.
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

    // Enregistrer le mouvement distant dans Dexie.
    await db.movements.add({
      ...remote,
      syncId: remoteDoc.id,
      syncStatus: "synced",
      productId: product.id,
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

  // Calculer les variations nettes.
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

  // Stock final = stock initial + entrées - sorties.
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