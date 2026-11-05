import Dexie, { type EntityTable } from "dexie";

export type SyncStatus = "pending" | "synced";

export type SyncEntityType = "product" | "movement";

export interface Product {
  id?: number;
  syncId?: string;
  syncStatus?: SyncStatus;

  name: string;
  sku: string;
  category: string;
  description: string;
  purchasePrice: number;
  salePrice: number;

  initialQuantity: number;
  quantity: number;

  minStock: number;
  createdAt: string;
  updatedAt: string;
}

export type MovementType = "ENTREE" | "SORTIE";

export interface Movement {
  id?: number;
  syncId?: string;
  syncStatus?: SyncStatus;

  purchasePriceAtMovement?: number;
  salePriceAtMovement?: number;

  productId: number;
  productSyncId?: string;

  productName: string;
  productSku: string;
  type: MovementType;
  quantity: number;
  previousStock: number;
  newStock: number;
  reason: string;
  note: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SyncDeletion {
  id?: number;
  syncId: string;
  entityType: SyncEntityType;
  syncStatus: SyncStatus;
  deletedAt: string;
}

function createSyncId(): string {
  return crypto.randomUUID();
}

export class NexoraDatabase extends Dexie {
  products!: EntityTable<Product, "id">;
  movements!: EntityTable<Movement, "id">;
  syncDeletions!: EntityTable<SyncDeletion, "id">;

  constructor(uid: string) {
    super(`NexoraInventory_${uid}`);

    // ==========================================
    // VERSION 1
    // ==========================================

    this.version(1).stores({
      products: "++id, &sku, name, category, quantity, createdAt",
    });

    // ==========================================
    // VERSION 2
    // ==========================================

    this.version(2).stores({
      products: "++id, &sku, name, category, quantity, createdAt",
      movements: "++id, productId, type, createdAt, productSku",
    });

    // ==========================================
    // VERSION 3 : IDENTIFIANTS DE SYNCHRONISATION
    // ==========================================

    this.version(3)
      .stores({
        products:
          "++id, &sku, &syncId, syncStatus, name, category, quantity, createdAt, updatedAt",

        movements:
          "++id, &syncId, syncStatus, productId, productSyncId, type, createdAt, updatedAt, productSku",
      })
      .upgrade(async (transaction) => {
        const productsTable = transaction.table("products");
        const movementsTable = transaction.table("movements");

        const products = await productsTable.toArray();
        const productSyncIds = new Map<number, string>();

        for (const product of products) {
          const syncId = product.syncId || createSyncId();

          product.syncId = syncId;
          product.syncStatus = "pending";
          product.updatedAt =
            product.updatedAt || product.createdAt;

          productSyncIds.set(product.id!, syncId);
        }

        await productsTable.bulkPut(products);

        const movements = await movementsTable.toArray();

        for (const movement of movements) {
          movement.syncId = movement.syncId || createSyncId();

          movement.productSyncId =
            productSyncIds.get(movement.productId);

          movement.updatedAt =
            movement.updatedAt || movement.createdAt;

          movement.syncStatus = "pending";
        }

        await movementsTable.bulkPut(movements);
      });

    // ==========================================
    // VERSION 4 : SUIVI DES SUPPRESSIONS
    // ==========================================

    this.version(4).stores({
      products:
        "++id, &sku, &syncId, syncStatus, name, category, quantity, createdAt, updatedAt",

      movements:
        "++id, &syncId, syncStatus, productId, productSyncId, type, createdAt, updatedAt, productSku",

      syncDeletions:
        "++id, &syncId, entityType, syncStatus, deletedAt",
    });

    // ==========================================
    // VERSION 5 : STOCK INITIAL
    // ==========================================

    this.version(5)
      .stores({
        products:
          "++id, &sku, &syncId, syncStatus, name, category, quantity, initialQuantity, createdAt, updatedAt",

        movements:
          "++id, &syncId, syncStatus, productId, productSyncId, type, createdAt, updatedAt, productSku",

        syncDeletions:
          "++id, &syncId, entityType, syncStatus, deletedAt",
      })
      .upgrade(async (transaction) => {
        const productsTable = transaction.table("products");
        const movementsTable = transaction.table("movements");

        const products = await productsTable.toArray();
        const movements = await movementsTable.toArray();

        // Calculer la variation nette de chaque produit.
        const netMovements = new Map<number, number>();

        for (const movement of movements) {
          const currentNet =
            netMovements.get(movement.productId) || 0;

          const variation =
            movement.type === "ENTREE"
              ? movement.quantity
              : -movement.quantity;

          netMovements.set(
            movement.productId,
            currentNet + variation
          );
        }

        // Reconstituer le stock initial.
        for (const product of products) {
          const netMovement =
            netMovements.get(product.id!) || 0;

          product.initialQuantity =
            product.quantity - netMovement;
        }

        await productsTable.bulkPut(products);
      });

    // ==========================================
    // PRODUITS
    // ==========================================

    this.products.hook("creating", (_primKey, product) => {
      product.syncId = product.syncId || createSyncId();

      if (product.syncStatus !== "synced") {
        product.syncStatus = "pending";
      }

      // Le stock saisi à la création devient le stock initial.
      if (product.initialQuantity === undefined) {
        product.initialQuantity = product.quantity;
      }

      product.updatedAt =
        product.updatedAt || new Date().toISOString();
    });

    this.products.hook("updating", (modifications) => {
      const changes = modifications as Partial<Product>;
      const keys = Object.keys(modifications);

      // Une confirmation de synchronisation ne doit pas
      // déclencher une nouvelle synchronisation.
      if (changes.syncStatus === "synced") {
        return modifications;
      }

      // Une modification du statut seul ne change pas
      // les données métier.
      if (keys.every((key) => key === "syncStatus")) {
        return modifications;
      }

      // Le recalcul du stock est une opération locale dérivée
      // des mouvements. Il ne doit pas remettre le produit
      // en attente de synchronisation.
      const isStockRecalculation = keys.every(
        (key) => key === "quantity" || key === "syncStatus"
      );

      if (isStockRecalculation) {
        return modifications;
      }

      // Les véritables modifications du produit
      // doivent être synchronisées.
      return {
        ...modifications,
        syncStatus: "pending",
        updatedAt: new Date().toISOString(),
      };
    });

    // ==========================================
    // MOUVEMENTS
    // ==========================================

    this.movements.hook("creating", (_primKey, movement) => {
      movement.syncId = movement.syncId || createSyncId();

      if (movement.syncStatus !== "synced") {
        movement.syncStatus = "pending";
      }

      movement.updatedAt =
        movement.updatedAt || new Date().toISOString();
    });

    this.movements.hook("updating", (modifications) => {
      const changes = modifications as Partial<Movement>;

      if (changes.syncStatus === "synced") {
        return modifications;
      }

      const keys = Object.keys(modifications);

      if (keys.every((key) => key === "syncStatus")) {
        return modifications;
      }

      return {
        ...modifications,
        syncStatus: "pending",
        updatedAt: new Date().toISOString(),
      };
    });

    // ==========================================
    // SUPPRESSIONS
    // ==========================================


    this.movements.hook(
      "deleting",
      (_primKey, movement, transaction) => {
        if (!movement.syncId) return;

        return transaction.table("syncDeletions").put({
          syncId: movement.syncId,
          entityType: "movement",
          syncStatus: "pending",
          deletedAt: new Date().toISOString(),
        });
      }
    );
  }
}

// ==========================================
// GESTION DES BASES UTILISATEURS
// ==========================================

const databases = new Map<string, NexoraDatabase>();

export function getUserDatabase(uid: string): NexoraDatabase {
  if (!uid) {
    throw new Error("Identifiant utilisateur Firebase manquant.");
  }

  const existingDatabase = databases.get(uid);

  if (existingDatabase) {
    return existingDatabase;
  }

  const database = new NexoraDatabase(uid);

  databases.set(uid, database);

  return database;
}