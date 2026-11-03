import Dexie, { type EntityTable } from "dexie";

export interface Product {
  id?: number;
  name: string;
  sku: string;
  category: string;
  description: string;
  purchasePrice: number;
  salePrice: number;
  quantity: number;
  minStock: number;
  createdAt: string;
  updatedAt: string;
}

export type MovementType = "ENTREE" | "SORTIE";

export interface Movement {
  id?: number;
  productId: number;
  productName: string;
  productSku: string;
  type: MovementType;
  quantity: number;
  previousStock: number;
  newStock: number;
  reason: string;
  note: string;
  createdAt: string;
}

export class NexoraDatabase extends Dexie {
  products!: EntityTable<Product, "id">;
  movements!: EntityTable<Movement, "id">;

  constructor(uid: string) {
    super(`NexoraInventory_${uid}`);

    this.version(1).stores({
      products: "++id, &sku, name, category, quantity, createdAt",
    });

    this.version(2).stores({
      products: "++id, &sku, name, category, quantity, createdAt",
      movements: "++id, productId, type, createdAt, productSku",
    });
  }
}

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