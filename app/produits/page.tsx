"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { QRCodeSVG } from "qrcode.react";
import { useLiveQuery } from "dexie-react-hooks";
import type { FormEvent, ReactNode } from "react";
import { useDatabase } from "@/lib/database/DatabaseProvider";
import type { Product, MovementType } from "@/lib/database/db";
import {
  Plus,
  Search,
  Package,
  AlertTriangle,
  Boxes,
  Pencil,
  Trash2,
  X,
  Save,
  SlidersHorizontal,
  Tag,
  Wallet,
  CheckCircle2,
  PackageSearch,
  QrCode,
  Printer,
  Camera,
  CameraOff,
  ScanLine,
} from "lucide-react";

const emptyForm = {
  name: "",
  sku: "",
  category: "Général",
  description: "",
  purchasePrice: "",
  salePrice: "",
  quantity: "",
  minStock: "5",
};

const categories = [
  "Général",
  "Informatique",
  "Accessoires",
  "Électronique",
  "Mobilier",
  "Alimentation",
  "Autres",
];

const QR_PREFIX = "NEXORA:PRODUCT:";

type BatchItem = {
  product: Product;
  type: MovementType;
  quantity: number;
  reason: string;
  note: string;
};

const formatFCFA = (amount: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(amount) + " FCFA";

export default function ProductsPage() {
  const db = useDatabase();

  const products = useLiveQuery(
    () => db.products.orderBy("createdAt").reverse().toArray(),
    [db],
    []
  );

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("Toutes");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [qrProduct, setQrProduct] = useState<Product | null>(null);

  // Scanner groupé intégré au catalogue
  const [scannerOpen, setScannerOpen] = useState(false);
  const [showScannerModeChoice, setShowScannerModeChoice] = useState(false);
  const [scannerMode, setScannerMode] = useState<MovementType | null>(null);
  const [scannerRunning, setScannerRunning] = useState(false);
  const [scannerError, setScannerError] = useState("");
  const [scannerMessage, setScannerMessage] = useState("");
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [savingBatch, setSavingBatch] = useState(false);
  const [batchSuccess, setBatchSuccess] = useState("");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanRef = useRef<{ value: string; at: number }>({ value: "", at: 0 });

  const handleBatchScan = useCallback(async (decodedText: string) => {
    const now = Date.now();
    if (
      lastScanRef.current.value === decodedText &&
      now - lastScanRef.current.at < 1800
    ) return;
    lastScanRef.current = { value: decodedText, at: now };

    if (!decodedText.startsWith(QR_PREFIX)) {
      setScannerMessage("Ce QR Code ne correspond pas à un produit Nexora.");
      return;
    }

    const syncId = decodedText.slice(QR_PREFIX.length).trim();
    if (!syncId) {
      setScannerMessage("Identifiant produit invalide.");
      return;
    }

    try {
      const product = await db.products.where("syncId").equals(syncId).first();
      if (!product || product.id === undefined) {
        setScannerMessage("Produit introuvable dans cet inventaire.");
        return;
      }

      setBatchItems((current) => {
        if (current.some((item) => item.product.id === product.id)) {
          setScannerMessage(`${product.name} est déjà dans la liste.`);
          return current;
        }
        setScannerMessage(`${product.name} ajouté à la session.`);
        return [...current, {
          product,
          type: scannerMode ?? "ENTREE",
          quantity: 1,
          reason: scannerMode === "SORTIE" ? "Vente" : "Approvisionnement",
          note: "",
        }];
      });
    } catch {
      setScannerMessage("Impossible de rechercher ce produit dans la base locale.");
    }
  }, [db, scannerMode]);

  useEffect(() => {
    if (!scannerOpen) return;

    let cancelled = false;
    const scanner = new Html5Qrcode("products-batch-qr-reader");
    scannerRef.current = scanner;

    scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 230, height: 230 }, aspectRatio: 1 },
      (decodedText) => { void handleBatchScan(decodedText); },
      () => undefined
    ).then(() => {
      if (!cancelled) {
        setScannerRunning(true);
        setScannerError("");
      } else {
        void scanner.stop().catch(() => undefined);
      }
    }).catch((err: unknown) => {
      if (!cancelled) {
        setScannerError(
          err instanceof Error
            ? err.message
            : "Impossible d'activer la caméra. Vérifiez les autorisations."
        );
      }
    });

    return () => {
      cancelled = true;
      setScannerRunning(false);
      if (scannerRef.current === scanner) scannerRef.current = null;
      if (scanner.isScanning) {
        void scanner.stop().then(() => scanner.clear()).catch(() => undefined);
      } else {
        try { scanner.clear(); } catch { /* scanner déjà nettoyé */ }
      }
    };
  }, [scannerOpen, handleBatchScan]);

  function updateBatchItem(
    productId: number | undefined,
    changes: Partial<Pick<BatchItem, "type" | "quantity" | "reason" | "note">>
  ) {
    setBatchItems((current) =>
      current.map((item) =>
        item.product.id === productId ? { ...item, ...changes } : item
      )
    );
  }

  async function saveBatchMovements() {
    if (savingBatch || batchItems.length === 0) return;
    setSavingBatch(true);
    setScannerError("");
    setBatchSuccess("");

    try {
      for (const item of batchItems) {
        if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
          throw new Error(`Quantité invalide pour ${item.product.name}.`);
        }
      }

      await db.transaction("rw", db.products, db.movements, async () => {
        for (const item of batchItems) {
          const productId = item.product.id;
          if (productId === undefined) {
            throw new Error(`Identifiant invalide pour ${item.product.name}.`);
          }

          const currentProduct = await db.products.get(productId);
          if (!currentProduct) {
            throw new Error(`Le produit ${item.product.name} n'existe plus.`);
          }

          const previousStock = currentProduct.quantity;
          const newStock = item.type === "ENTREE"
            ? previousStock + item.quantity
            : previousStock - item.quantity;

          if (newStock < 0) {
            throw new Error(
              `Stock insuffisant pour ${currentProduct.name}. Disponible : ${previousStock}.`
            );
          }

          const timestamp = new Date().toISOString();
          await db.products.update(productId, {
            quantity: newStock,
            updatedAt: timestamp,
          });

          await db.movements.add({
            productId,
            productSyncId: currentProduct.syncId,
            productName: currentProduct.name,
            productSku: currentProduct.sku,
            type: item.type,
            quantity: item.quantity,
            previousStock,
            newStock,
            reason: item.reason.trim() || (item.type === "ENTREE" ? "Approvisionnement" : "Vente"),
            note: item.note.trim(),
            createdAt: timestamp,
          });
        }
      });

      setBatchSuccess(`${batchItems.length} mouvement(s) enregistré(s) avec succès.`);
      setBatchItems([]);
      setScannerMessage("");
      setScannerOpen(false);
    } catch (err) {
      setScannerError(
        err instanceof Error ? err.message : "Impossible d'enregistrer les mouvements."
      );
    } finally {
      setSavingBatch(false);
    }
  }

  const filteredProducts = products.filter((product) => {
    const query = search.trim().toLowerCase();
    const matchesSearch =
      product.name.toLowerCase().includes(query) ||
      product.sku.toLowerCase().includes(query);

    const matchesCategory =
      categoryFilter === "Toutes" || product.category === categoryFilter;

    return matchesSearch && matchesCategory;
  });

  const totalProducts = products.length;
  const totalQuantity = products.reduce((total, product) => total + product.quantity, 0);
  const lowStock = products.filter((product) => product.quantity <= product.minStock).length;
  const stockValue = products.reduce(
    (total, product) => total + product.purchasePrice * product.quantity,
    0
  );

  function openAddForm() {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setShowForm(true);
  }

  function openEditForm(product: Product) {
    if (product.id === undefined) return;

    setEditingId(product.id);
    setForm({
      name: product.name,
      sku: product.sku,
      category: product.category,
      description: product.description,
      purchasePrice: String(product.purchasePrice),
      salePrice: String(product.salePrice),
      quantity: String(product.quantity),
      minStock: String(product.minStock),
    });
    setError("");
    setShowForm(true);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const purchasePrice = Number(form.purchasePrice);
    const salePrice = Number(form.salePrice);
    const quantity = Number(form.quantity);
    const minStock = Number(form.minStock);

    if (!form.name.trim() || !form.sku.trim() || !form.category.trim()) {
      setError("Veuillez remplir les champs obligatoires.");
      return;
    }

    if (
      !Number.isFinite(purchasePrice) ||
      !Number.isFinite(salePrice) ||
      !Number.isInteger(quantity) ||
      !Number.isInteger(minStock) ||
      purchasePrice < 0 ||
      salePrice < 0 ||
      quantity < 0 ||
      minStock < 0
    ) {
      setError("Vérifiez les prix et les quantités.");
      return;
    }

    const sku = form.sku.trim().toUpperCase();

    try {
      const duplicate = await db.products.where("sku").equals(sku).first();

      if (duplicate && duplicate.id !== editingId) {
        setError("Cette référence SKU existe déjà.");
        return;
      }

    const now = new Date().toISOString();

    const existingProduct =
      editingId !== null
        ? await db.products.get(editingId)
        : undefined;

    if (editingId !== null && !existingProduct) {
      setError("Produit introuvable.");
      return;
    }

    const productData = {
      name: form.name.trim(),
      sku,
      category: form.category,
      description: form.description.trim(),
      purchasePrice,
      salePrice,

      // Le stock ne peut être modifié que par les mouvements.
      quantity: existingProduct?.quantity ?? quantity,

      // Le stock initial est conservé lors des modifications.
      initialQuantity: existingProduct?.initialQuantity ?? quantity,

      minStock,
      updatedAt: now,
    };

      if (editingId !== null) {
        await db.products.update(editingId, productData);
      } else {
        const newProductId = await db.products.add({
          ...productData,
          createdAt: now,
        });

        // Le hook Dexie attribue le syncId unique à la création.
        const createdProduct = await db.products.get(newProductId);
        if (createdProduct) setQrProduct(createdProduct);
      }

      setShowForm(false);
      setForm(emptyForm);
      setEditingId(null);
    } catch {
      setError("Impossible d'enregistrer ce produit.");
    }
  }

function printProductQr(product: Product) {
  if (!product.syncId) {
    window.alert("Ce produit ne possède pas encore d'identifiant QR. Actualisez la page puis réessayez.");
    return;
  }

  const svg = document.getElementById(`product-qr-${product.id}`)?.outerHTML;
  if (!svg) {
    window.alert("Impossible de préparer le QR Code.");
    return;
  }

  const printWindow = window.open("", "_blank", "width=520,height=640");
  if (!printWindow) {
    window.alert("Autorisez les fenêtres contextuelles pour imprimer cette étiquette.");
    return;
  }

  const escapeHtml = (value: string) =>
    value.replace(/[&<>"']/g, (character) => {
      const entities: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return entities[character];
    });

  printWindow.document.write(`<!doctype html>
    <html lang="fr">
      <head>
        <meta charset="utf-8" />
        <title>Étiquette - ${escapeHtml(product.name)}</title>
        <style>
          body { font-family: Arial, sans-serif; display: flex; justify-content: center; padding: 28px; color: #111827; }
          .label { width: 280px; text-align: center; border: 1px solid #d1d5db; border-radius: 12px; padding: 20px; }
          svg { width: 190px; height: 190px; }
          h1 { font-size: 18px; margin: 12px 0 5px; }
          p { font-size: 12px; margin: 4px 0; color: #4b5563; }
          @media print { body { padding: 0; } .label { border: 0; } }
        </style>
      </head>
      <body>
        <main class="label">
          ${svg}
          <h1>${escapeHtml(product.name)}</h1>
          <p>Référence : ${escapeHtml(product.sku)}</p>
          <p>Nexora Inventory</p>
        </main>
        <script>window.onload = () => { window.print(); };</script>
      </body>
    </html>`);
  printWindow.document.close();
}

async function deleteProduct(product: Product) {
  const confirmed = window.confirm(
    `Supprimer le produit "${product.name}" ?`
  );

  if (!confirmed || product.id === undefined) return;

  try {
    await db.transaction(
      "rw",
      db.products,
      db.syncDeletions,
      async () => {
        const currentProduct = await db.products.get(product.id!);

        if (!currentProduct) return;

        if (currentProduct.syncId) {
          const existingDeletion = await db.syncDeletions
            .where("syncId")
            .equals(currentProduct.syncId)
            .first();

          const deletionData = {
            syncId: currentProduct.syncId,
            entityType: "product" as const,
            syncStatus: "pending" as const,
            deletedAt: new Date().toISOString(),
          };

          if (existingDeletion?.id !== undefined) {
            await db.syncDeletions.update(
              existingDeletion.id,
              deletionData
            );
          } else {
            await db.syncDeletions.add(deletionData);
          }
        }

        await db.products.delete(product.id!);
      }
    );

    console.log("[Nexora] Suppression locale enregistrée.");
  } catch (error) {
    console.error("[Nexora] Erreur de suppression :", error);
    window.alert("Impossible de supprimer ce produit.");
  }
}

  return (
    <main className="min-h-screen bg-[#F5F7FB] pb-12 text-slate-900">
      <div className="mx-auto max-w-[1440px] space-y-7 p-4 sm:p-6 lg:p-8">
        {/* EN-TÊTE */}
        <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-blue-700 ring-1 ring-blue-100">
              <Package size={13} />
              INVENTAIRE / CATALOGUE
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
              Catalogue des produits
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
              Gérez vos références, suivez vos quantités et gardez une vue claire sur votre stock.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                setBatchSuccess("");
                setScannerError("");
                setScannerMessage("");
                if (scannerOpen) {
                  setScannerOpen(false);
                  setScannerMode(null);
                  setShowScannerModeChoice(false);
                } else {
                  setShowScannerModeChoice(true);
                }
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-5 py-3 text-sm font-bold text-blue-700 transition hover:bg-blue-50"
            >
              {scannerOpen ? <CameraOff size={18} /> : <ScanLine size={18} />}
              {scannerOpen ? "Fermer le scanner" : "Scanner plusieurs produits"}
            </button>
            <button
              onClick={openAddForm}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-700/20 transition hover:-translate-y-0.5 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-200"
            >
              <Plus size={18} />
              Nouveau produit
            </button>
          </div>
        </section>

        {/* CHOIX DU TYPE DE MOUVEMENT AVANT OUVERTURE DE LA CAMERA */}
        {showScannerModeChoice && !scannerOpen && (
          <section className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-4">
              <h2 className="text-lg font-bold text-slate-900">Quel mouvement souhaitez-vous effectuer ?</h2>
              <p className="mt-1 text-sm text-slate-500">Choisissez le type d'opération avant de commencer le scan. Tous les produits de cette session utiliseront ce choix.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setScannerMode("ENTREE");
                  setBatchItems([]);
                  setScannerOpen(true);
                  setShowScannerModeChoice(false);
                }}
                className="flex min-h-24 items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-left transition hover:bg-emerald-100"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Plus size={22} /></span>
                <span><span className="block font-bold text-emerald-800">Entrée de stock</span><span className="mt-1 block text-xs text-emerald-700">Ajouter des quantités au stock</span></span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setScannerMode("SORTIE");
                  setBatchItems([]);
                  setScannerOpen(true);
                  setShowScannerModeChoice(false);
                }}
                className="flex min-h-24 items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 p-4 text-left transition hover:bg-orange-100"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-100 text-orange-700"><Package size={22} /></span>
                <span><span className="block font-bold text-orange-800">Sortie de stock</span><span className="mt-1 block text-xs text-orange-700">Retirer des quantités du stock</span></span>
              </button>
            </div>
            <button type="button" onClick={() => setShowScannerModeChoice(false)} className="mt-4 text-sm font-semibold text-slate-500 hover:text-slate-700">Annuler</button>
          </section>
        )}

        {/* SCANNER MULTI-PRODUITS */}
        {scannerOpen && (
          <section className="grid gap-5 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm sm:p-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-bold text-slate-900">Scanner les produits — {scannerMode === "SORTIE" ? "Sortie de stock" : "Entrée de stock"}</h2>
                  <p className="mt-1 text-xs text-slate-500">Scannez plusieurs références pour cette même opération.</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${scannerRunning ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  {scannerRunning ? "Caméra active" : "Initialisation"}
                </span>
              </div>
              <div className="overflow-hidden rounded-2xl bg-slate-950">
                <div id="products-batch-qr-reader" className="min-h-[280px] w-full" />
              </div>
              {scannerError && (
                <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-medium text-rose-700">{scannerError}</p>
              )}
              {scannerMessage && (
                <p aria-live="polite" className="mt-3 rounded-xl bg-blue-50 p-3 text-xs font-medium text-blue-700">{scannerMessage}</p>
              )}
              <p className="mt-3 text-[11px] leading-5 text-slate-400">
                Chaque produit est ajouté une seule fois. Le type de mouvement est fixé pour toute cette session ; vous pouvez ajuster les quantités avant validation.
              </p>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900">Session de scan</h3>
                  <p className="mt-1 text-xs text-slate-500">{batchItems.length} produit(s) ajouté(s)</p>
                </div>
                {batchItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setBatchItems([])}
                    className="text-xs font-semibold text-rose-600 hover:text-rose-700"
                  >
                    Vider la liste
                  </button>
                )}
              </div>

              {batchItems.length === 0 ? (
                <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 p-5 text-center">
                  <QrCode size={28} className="mb-2 text-slate-300" />
                  <p className="text-sm font-semibold text-slate-700">Aucun produit scanné</p>
                  <p className="mt-1 text-xs text-slate-400">Présente un QR Code Nexora devant la caméra.</p>
                </div>
              ) : (
                <div className="max-h-[430px] space-y-3 overflow-y-auto pr-1">
                  {batchItems.map((item) => (
                    <div key={item.product.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-800">{item.product.name}</p>
                          <p className="mt-1 text-[11px] text-slate-400">{item.product.sku} · Stock actuel : {item.product.quantity}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setBatchItems((current) => current.filter((entry) => entry.product.id !== item.product.id))}
                          aria-label={`Retirer ${item.product.name}`}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <X size={16} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="text-[11px] font-semibold text-slate-500">
                          Opération
                          <div className={`mt-1 rounded-lg px-2 py-2 text-xs font-bold ${item.type === "ENTREE" ? "bg-emerald-50 text-emerald-700" : "bg-orange-50 text-orange-700"}`}>
                            {item.type === "ENTREE" ? "Entrée de stock" : "Sortie de stock"}
                          </div>
                        </div>
                        <label className="text-[11px] font-semibold text-slate-500">
                          Quantité
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={item.quantity}
                            onChange={(e) => updateBatchItem(item.product.id, { quantity: Number(e.target.value) })}
                            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-xs text-slate-700"
                          />
                        </label>
                      </div>
                      <label className="mt-2 block text-[11px] font-semibold text-slate-500">
                        Motif
                        <input
                          value={item.reason}
                          onChange={(e) => updateBatchItem(item.product.id, { reason: e.target.value })}
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700"
                        />
                      </label>
                    </div>
                  ))}
                </div>
              )}

              {batchItems.length > 0 && (
                <div className="mt-4 rounded-xl bg-slate-50 p-3">
                  <div className="flex justify-between text-xs text-slate-600">
                    <span>Entrées</span>
                    <strong>{batchItems.filter((item) => item.type === "ENTREE").length}</strong>
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-slate-600">
                    <span>Sorties</span>
                    <strong>{batchItems.filter((item) => item.type === "SORTIE").length}</strong>
                  </div>
                  <button
                    type="button"
                    onClick={saveBatchMovements}
                    disabled={savingBatch}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-800 disabled:opacity-50"
                  >
                    <Save size={17} />
                    {savingBatch ? "Enregistrement..." : "Valider tous les mouvements"}
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {batchSuccess && (
          <div role="status" className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
            <CheckCircle2 size={18} className="mr-2 inline" />
            {batchSuccess}
          </div>
        )}

        {/* INDICATEURS */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Vue d’ensemble</h2>
              <p className="mt-1 text-xs text-slate-500">Indicateurs de votre catalogue</p>
            </div>
            <span className="hidden items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200 sm:inline-flex">
              <CheckCircle2 size={13} className="text-emerald-500" />
              Actualisation automatique
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard
              title="Références"
              value={String(totalProducts)}
              caption="Produits enregistrés"
              icon={<Package size={19} />}
              tone="blue"
            />
            <StatCard
              title="Quantité totale"
              value={String(totalQuantity)}
              caption="Unités en stock"
              icon={<Boxes size={19} />}
              tone="violet"
            />
            <StatCard
              title="Stocks faibles"
              value={String(lowStock)}
              caption={lowStock > 0 ? "Réapprovisionnement à prévoir" : "Aucune alerte"}
              icon={<AlertTriangle size={19} />}
              tone="amber"
              alert={lowStock > 0}
            />
            <StatCard
              title="Valeur du stock"
              value={formatFCFA(stockValue)}
              caption="Calculée au prix d’achat"
              icon={<Wallet size={19} />}
              tone="emerald"
            />
          </div>
        </section>

        {/* RECHERCHE ET FILTRES */}
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80 sm:p-5">
          <div className="mb-4 flex items-center gap-2">
            <SlidersHorizontal size={16} className="text-slate-400" />
            <h2 className="text-sm font-bold text-slate-800">Rechercher et filtrer</h2>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_260px]">
            <div className="relative">
              <Search
                size={18}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                placeholder="Rechercher par nom ou référence SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-3 pl-11 pr-4 text-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
              />
            </div>

            <div className="relative">
              <Tag
                size={16}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                "use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { QRCodeSVG } from "qrcode.react";
import { useLiveQuery } from "dexie-react-hooks";
import type { FormEvent, ReactNode } from "react";
import { useDatabase } from "@/lib/database/DatabaseProvider";
import type { Product, MovementType } from "@/lib/database/db";
import {
  Plus,
  Search,
  Package,
  AlertTriangle,
  Boxes,
  Pencil,
  Trash2,
  X,
  Save,
  SlidersHorizontal,
  Tag,
  Wallet,
  CheckCircle2,
  PackageSearch,
  QrCode,
  Printer,
  Camera,
  CameraOff,
  ScanLine,
} from "lucide-react";

const emptyForm = {
  name: "",
  sku: "",
  category: "Général",
  description: "",
  purchasePrice: "",
  salePrice: "",
  quantity: "",
  minStock: "5",
};

const categories = [
  "Général",
  "Informatique",
  "Accessoires",
  "Électronique",
  "Mobilier",
  "Alimentation",
  "Autres",
];

const QR_PREFIX = "NEXORA:PRODUCT:";

type BatchItem = {
  product: Product;
  type: MovementType;
  quantity: number;
  reason: string;
  note: string;
};

const formatFCFA = (amount: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(amount) + " FCFA";

export default function ProductsPage() {
  const db = useDatabase();

  const products = useLiveQuery(
    () => db.products.orderBy("createdAt").reverse().toArray(),
    [db],
    []
  );

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("Toutes");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [qrProduct, setQrProduct] = useState<Product | null>(null);

  // Scanner groupé intégré au catalogue
  const [scannerOpen, setScannerOpen] = useState(false);
  const [showScannerModeChoice, setShowScannerModeChoice] = useState(false);
  const [scannerMode, setScannerMode] = useState<MovementType | null>(null);
  const [scannerRunning, setScannerRunning] = useState(false);
  const [scannerError, setScannerError] = useState("");
  const [scannerMessage, setScannerMessage] = useState("");
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [savingBatch, setSavingBatch] = useState(false);
  const [batchSuccess, setBatchSuccess] = useState("");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanRef = useRef<{ value: string; at: number }>({ value: "", at: 0 });

  const handleBatchScan = useCallback(async (decodedText: string) => {
    const now = Date.now();
    if (
      lastScanRef.current.value === decodedText &&
      now - lastScanRef.current.at < 1800
    ) return;
    lastScanRef.current = { value: decodedText, at: now };

    if (!decodedText.startsWith(QR_PREFIX)) {
      setScannerMessage("Ce QR Code ne correspond pas à un produit Nexora.");
      return;
    }

    const syncId = decodedText.slice(QR_PREFIX.length).trim();
    if (!syncId) {
      setScannerMessage("Identifiant produit invalide.");
      return;
    }

    try {
      const product = await db.products.where("syncId").equals(syncId).first();
      if (!product || product.id === undefined) {
        setScannerMessage("Produit introuvable dans cet inventaire.");
        return;
      }

      setBatchItems((current) => {
        if (current.some((item) => item.product.id === product.id)) {
          setScannerMessage(`${product.name} est déjà dans la liste.`);
          return current;
        }
        setScannerMessage(`${product.name} ajouté à la session.`);
        return [...current, {
          product,
          type: scannerMode ?? "ENTREE",
          quantity: 1,
          reason: scannerMode === "SORTIE" ? "Vente" : "Approvisionnement",
          note: "",
        }];
      });
    } catch {
      setScannerMessage("Impossible de rechercher ce produit dans la base locale.");
    }
  }, [db, scannerMode]);

  useEffect(() => {
    if (!scannerOpen) return;

    let cancelled = false;
    const scanner = new Html5Qrcode("products-batch-qr-reader");
    scannerRef.current = scanner;

    scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 230, height: 230 }, aspectRatio: 1 },
      (decodedText) => { void handleBatchScan(decodedText); },
      () => undefined
    ).then(() => {
      if (!cancelled) {
        setScannerRunning(true);
        setScannerError("");
      } else {
        void scanner.stop().catch(() => undefined);
      }
    }).catch((err: unknown) => {
      if (!cancelled) {
        setScannerError(
          err instanceof Error
            ? err.message
            : "Impossible d'activer la caméra. Vérifiez les autorisations."
        );
      }
    });

    return () => {
      cancelled = true;
      setScannerRunning(false);
      if (scannerRef.current === scanner) scannerRef.current = null;
      if (scanner.isScanning) {
        void scanner.stop().then(() => scanner.clear()).catch(() => undefined);
      } else {
        try { scanner.clear(); } catch { /* scanner déjà nettoyé */ }
      }
    };
  }, [scannerOpen, handleBatchScan]);

  function updateBatchItem(
    productId: number | undefined,
    changes: Partial<Pick<BatchItem, "type" | "quantity" | "reason" | "note">>
  ) {
    setBatchItems((current) =>
      current.map((item) =>
        item.product.id === productId ? { ...item, ...changes } : item
      )
    );
  }

  async function saveBatchMovements() {
    if (savingBatch || batchItems.length === 0) return;
    setSavingBatch(true);
    setScannerError("");
    setBatchSuccess("");

    try {
      for (const item of batchItems) {
        if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
          throw new Error(`Quantité invalide pour ${item.product.name}.`);
        }
      }

      await db.transaction("rw", db.products, db.movements, async () => {
        for (const item of batchItems) {
          const productId = item.product.id;
          if (productId === undefined) {
            throw new Error(`Identifiant invalide pour ${item.product.name}.`);
          }

          const currentProduct = await db.products.get(productId);
          if (!currentProduct) {
            throw new Error(`Le produit ${item.product.name} n'existe plus.`);
          }

          const previousStock = currentProduct.quantity;
          const newStock = item.type === "ENTREE"
            ? previousStock + item.quantity
            : previousStock - item.quantity;

          if (newStock < 0) {
            throw new Error(
              `Stock insuffisant pour ${currentProduct.name}. Disponible : ${previousStock}.`
            );
          }

          const timestamp = new Date().toISOString();
          await db.products.update(productId, {
            quantity: newStock,
            updatedAt: timestamp,
          });

          await db.movements.add({
            productId,
            productSyncId: currentProduct.syncId,
            productName: currentProduct.name,
            productSku: currentProduct.sku,
            type: item.type,
            quantity: item.quantity,
            previousStock,
            newStock,
            reason: item.reason.trim() || (item.type === "ENTREE" ? "Approvisionnement" : "Vente"),
            note: item.note.trim(),
            createdAt: timestamp,
          });
        }
      });

      setBatchSuccess(`${batchItems.length} mouvement(s) enregistré(s) avec succès.`);
      setBatchItems([]);
      setScannerMessage("");
      setScannerOpen(false);
    } catch (err) {
      setScannerError(
        err instanceof Error ? err.message : "Impossible d'enregistrer les mouvements."
      );
    } finally {
      setSavingBatch(false);
    }
  }

  const filteredProducts = products.filter((product) => {
    const query = search.trim().toLowerCase();
    const matchesSearch =
      product.name.toLowerCase().includes(query) ||
      product.sku.toLowerCase().includes(query);

    const matchesCategory =
      categoryFilter === "Toutes" || product.category === categoryFilter;

    return matchesSearch && matchesCategory;
  });

  const totalProducts = products.length;
  const totalQuantity = products.reduce((total, product) => total + product.quantity, 0);
  const lowStock = products.filter((product) => product.quantity <= product.minStock).length;
  const stockValue = products.reduce(
    (total, product) => total + product.purchasePrice * product.quantity,
    0
  );

  function openAddForm() {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setShowForm(true);
  }

  function openEditForm(product: Product) {
    if (product.id === undefined) return;

    setEditingId(product.id);
    setForm({
      name: product.name,
      sku: product.sku,
      category: product.category,
      description: product.description,
      purchasePrice: String(product.purchasePrice),
      salePrice: String(product.salePrice),
      quantity: String(product.quantity),
      minStock: String(product.minStock),
    });
    setError("");
    setShowForm(true);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const purchasePrice = Number(form.purchasePrice);
    const salePrice = Number(form.salePrice);
    const quantity = Number(form.quantity);
    const minStock = Number(form.minStock);

    if (!form.name.trim() || !form.sku.trim() || !form.category.trim()) {
      setError("Veuillez remplir les champs obligatoires.");
      return;
    }

    if (
      !Number.isFinite(purchasePrice) ||
      !Number.isFinite(salePrice) ||
      !Number.isInteger(quantity) ||
      !Number.isInteger(minStock) ||
      purchasePrice < 0 ||
      salePrice < 0 ||
      quantity < 0 ||
      minStock < 0
    ) {
      setError("Vérifiez les prix et les quantités.");
      return;
    }

    const sku = form.sku.trim().toUpperCase();

    try {
      const duplicate = await db.products.where("sku").equals(sku).first();

      if (duplicate && duplicate.id !== editingId) {
        setError("Cette référence SKU existe déjà.");
        return;
      }

    const now = new Date().toISOString();

    const existingProduct =
      editingId !== null
        ? await db.products.get(editingId)
        : undefined;

    if (editingId !== null && !existingProduct) {
      setError("Produit introuvable.");
      return;
    }

    const productData = {
      name: form.name.trim(),
      sku,
      category: form.category,
      description: form.description.trim(),
      purchasePrice,
      salePrice,

      // Le stock ne peut être modifié que par les mouvements.
      quantity: existingProduct?.quantity ?? quantity,

      // Le stock initial est conservé lors des modifications.
      initialQuantity: existingProduct?.initialQuantity ?? quantity,

      minStock,
      updatedAt: now,
    };

      if (editingId !== null) {
        await db.products.update(editingId, productData);
      } else {
        const newProductId = await db.products.add({
          ...productData,
          createdAt: now,
        });

        // Le hook Dexie attribue le syncId unique à la création.
        const createdProduct = await db.products.get(newProductId);
        if (createdProduct) setQrProduct(createdProduct);
      }

      setShowForm(false);
      setForm(emptyForm);
      setEditingId(null);
    } catch {
      setError("Impossible d'enregistrer ce produit.");
    }
  }

function printProductQr(product: Product) {
  if (!product.syncId) {
    window.alert("Ce produit ne possède pas encore d'identifiant QR. Actualisez la page puis réessayez.");
    return;
  }

  const svg = document.getElementById(`product-qr-${product.id}`)?.outerHTML;
  if (!svg) {
    window.alert("Impossible de préparer le QR Code.");
    return;
  }

  const printWindow = window.open("", "_blank", "width=520,height=640");
  if (!printWindow) {
    window.alert("Autorisez les fenêtres contextuelles pour imprimer cette étiquette.");
    return;
  }

  const escapeHtml = (value: string) =>
    value.replace(/[&<>"']/g, (character) => {
      const entities: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return entities[character];
    });

  printWindow.document.write(`<!doctype html>
    <html lang="fr">
      <head>
        <meta charset="utf-8" />
        <title>Étiquette - ${escapeHtml(product.name)}</title>
        <style>
          body { font-family: Arial, sans-serif; display: flex; justify-content: center; padding: 28px; color: #111827; }
          .label { width: 280px; text-align: center; border: 1px solid #d1d5db; border-radius: 12px; padding: 20px; }
          svg { width: 190px; height: 190px; }
          h1 { font-size: 18px; margin: 12px 0 5px; }
          p { font-size: 12px; margin: 4px 0; color: #4b5563; }
          @media print { body { padding: 0; } .label { border: 0; } }
        </style>
      </head>
      <body>
        <main class="label">
          ${svg}
          <h1>${escapeHtml(product.name)}</h1>
          <p>Référence : ${escapeHtml(product.sku)}</p>
          <p>Nexora Inventory</p>
        </main>
        <script>window.onload = () => { window.print(); };</script>
      </body>
    </html>`);
  printWindow.document.close();
}

async function deleteProduct(product: Product) {
  const confirmed = window.confirm(
    `Supprimer le produit "${product.name}" ?`
  );

  if (!confirmed || product.id === undefined) return;

  try {
    await db.transaction(
      "rw",
      db.products,
      db.syncDeletions,
      async () => {
        const currentProduct = await db.products.get(product.id!);

        if (!currentProduct) return;

        if (currentProduct.syncId) {
          const existingDeletion = await db.syncDeletions
            .where("syncId")
            .equals(currentProduct.syncId)
            .first();

          const deletionData = {
            syncId: currentProduct.syncId,
            entityType: "product" as const,
            syncStatus: "pending" as const,
            deletedAt: new Date().toISOString(),
          };

          if (existingDeletion?.id !== undefined) {
            await db.syncDeletions.update(
              existingDeletion.id,
              deletionData
            );
          } else {
            await db.syncDeletions.add(deletionData);
          }
        }

        await db.products.delete(product.id!);
      }
    );

    console.log("[Nexora] Suppression locale enregistrée.");
  } catch (error) {
    console.error("[Nexora] Erreur de suppression :", error);
    window.alert("Impossible de supprimer ce produit.");
  }
}

  return (
    <main className="min-h-screen bg-[#F5F7FB] pb-12 text-slate-900">
      <div className="mx-auto max-w-[1440px] space-y-7 p-4 sm:p-6 lg:p-8">
        {/* EN-TÊTE */}
        <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-blue-700 ring-1 ring-blue-100">
              <Package size={13} />
              INVENTAIRE / CATALOGUE
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
              Catalogue des produits
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
              Gérez vos références, suivez vos quantités et gardez une vue claire sur votre stock.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                setBatchSuccess("");
                setScannerError("");
                setScannerMessage("");
                if (scannerOpen) {
                  setScannerOpen(false);
                  setScannerMode(null);
                  setShowScannerModeChoice(false);
                } else {
                  setShowScannerModeChoice(true);
                }
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-5 py-3 text-sm font-bold text-blue-700 transition hover:bg-blue-50"
            >
              {scannerOpen ? <CameraOff size={18} /> : <ScanLine size={18} />}
              {scannerOpen ? "Fermer le scanner" : "Scanner plusieurs produits"}
            </button>
            <button
              onClick={openAddForm}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-700/20 transition hover:-translate-y-0.5 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-200"
            >
              <Plus size={18} />
              Nouveau produit
            </button>
          </div>
        </section>

        {/* CHOIX DU TYPE DE MOUVEMENT AVANT OUVERTURE DE LA CAMERA */}
        {showScannerModeChoice && !scannerOpen && (
          <section className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-4">
              <h2 className="text-lg font-bold text-slate-900">Quel mouvement souhaitez-vous effectuer ?</h2>
              <p className="mt-1 text-sm text-slate-500">Choisissez le type d'opération avant de commencer le scan. Tous les produits de cette session utiliseront ce choix.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setScannerMode("ENTREE");
                  setBatchItems([]);
                  setScannerOpen(true);
                  setShowScannerModeChoice(false);
                }}
                className="flex min-h-24 items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-left transition hover:bg-emerald-100"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Plus size={22} /></span>
                <span><span className="block font-bold text-emerald-800">Entrée de stock</span><span className="mt-1 block text-xs text-emerald-700">Ajouter des quantités au stock</span></span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setScannerMode("SORTIE");
                  setBatchItems([]);
                  setScannerOpen(true);
                  setShowScannerModeChoice(false);
                }}
                className="flex min-h-24 items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 p-4 text-left transition hover:bg-orange-100"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-100 text-orange-700"><Package size={22} /></span>
                <span><span className="block font-bold text-orange-800">Sortie de stock</span><span className="mt-1 block text-xs text-orange-700">Retirer des quantités du stock</span></span>
              </button>
            </div>
            <button type="button" onClick={() => setShowScannerModeChoice(false)} className="mt-4 text-sm font-semibold text-slate-500 hover:text-slate-700">Annuler</button>
          </section>
        )}

        {/* SCANNER MULTI-PRODUITS */}
        {scannerOpen && (
          <section className="grid gap-5 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm sm:p-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-bold text-slate-900">Scanner les produits — {scannerMode === "SORTIE" ? "Sortie de stock" : "Entrée de stock"}</h2>
                  <p className="mt-1 text-xs text-slate-500">Scannez plusieurs références pour cette même opération.</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${scannerRunning ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  {scannerRunning ? "Caméra active" : "Initialisation"}
                </span>
              </div>
              <div className="overflow-hidden rounded-2xl bg-slate-950">
                <div id="products-batch-qr-reader" className="min-h-[280px] w-full" />
              </div>
              {scannerError && (
                <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-medium text-rose-700">{scannerError}</p>
              )}
              {scannerMessage && (
                <p aria-live="polite" className="mt-3 rounded-xl bg-blue-50 p-3 text-xs font-medium text-blue-700">{scannerMessage}</p>
              )}
              <p className="mt-3 text-[11px] leading-5 text-slate-400">
                Chaque produit est ajouté une seule fois. Le type de mouvement est fixé pour toute cette session ; vous pouvez ajuster les quantités avant validation.
              </p>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900">Session de scan</h3>
                  <p className="mt-1 text-xs text-slate-500">{batchItems.length} produit(s) ajouté(s)</p>
                </div>
                {batchItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setBatchItems([])}
                    className="text-xs font-semibold text-rose-600 hover:text-rose-700"
                  >
                    Vider la liste
                  </button>
                )}
              </div>

              {batchItems.length === 0 ? (
                <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 p-5 text-center">
                  <QrCode size={28} className="mb-2 text-slate-300" />
                  <p className="text-sm font-semibold text-slate-700">Aucun produit scanné</p>
                  <p className="mt-1 text-xs text-slate-400">Présente un QR Code Nexora devant la caméra.</p>
                </div>
              ) : (
                <div className="max-h-[430px] space-y-3 overflow-y-auto pr-1">
                  {batchItems.map((item) => (
                    <div key={item.product.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-800">{item.product.name}</p>
                          <p className="mt-1 text-[11px] text-slate-400">{item.product.sku} · Stock actuel : {item.product.quantity}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setBatchItems((current) => current.filter((entry) => entry.product.id !== item.product.id))}
                          aria-label={`Retirer ${item.product.name}`}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <X size={16} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="text-[11px] font-semibold text-slate-500">
                          Opération
                          <div className={`mt-1 rounded-lg px-2 py-2 text-xs font-bold ${item.type === "ENTREE" ? "bg-emerald-50 text-emerald-700" : "bg-orange-50 text-orange-700"}`}>
                            {item.type === "ENTREE" ? "Entrée de stock" : "Sortie de stock"}
                          </div>
                        </div>
                        <label className="text-[11px] font-semibold text-slate-500">
                          Quantité
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={item.quantity}
                            onChange={(e) => updateBatchItem(item.product.id, { quantity: Number(e.target.value) })}
                            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-xs text-slate-700"
                          />
                        </label>
                      </div>
                      <label className="mt-2 block text-[11px] font-semibold text-slate-500">
                        Motif
                        <input
                          value={item.reason}
                          onChange={(e) => updateBatchItem(item.product.id, { reason: e.target.value })}
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700"
                        />
                      </label>
                    </div>
                  ))}
                </div>
              )}

              {batchItems.length > 0 && (
                <div className="mt-4 rounded-xl bg-slate-50 p-3">
                  <div className="flex justify-between text-xs text-slate-600">
                    <span>Entrées</span>
                    <strong>{batchItems.filter((item) => item.type === "ENTREE").length}</strong>
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-slate-600">
                    <span>Sorties</span>
                    <strong>{batchItems.filter((item) => item.type === "SORTIE").length}</strong>
                  </div>
                  <button
                    type="button"
                    onClick={saveBatchMovements}
                    disabled={savingBatch}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-800 disabled:opacity-50"
                  >
                    <Save size={17} />
                    {savingBatch ? "Enregistrement..." : "Valider tous les mouvements"}
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {batchSuccess && (
          <div role="status" className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
            <CheckCircle2 size={18} className="mr-2 inline" />
            {batchSuccess}
          </div>
        )}

        {/* INDICATEURS */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Vue d’ensemble</h2>
              <p className="mt-1 text-xs text-slate-500">Indicateurs de votre catalogue</p>
            </div>
            <span className="hidden items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200 sm:inline-flex">
              <CheckCircle2 size={13} className="text-emerald-500" />
              Actualisation automatique
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard
              title="Références"
              value={String(totalProducts)}
              caption="Produits enregistrés"
              icon={<Package size={19} />}
              tone="blue"
            />
            <StatCard
              title="Quantité totale"
              value={String(totalQuantity)}
              caption="Unités en stock"
              icon={<Boxes size={19} />}
              tone="violet"
            />
            <StatCard
              title="Stocks faibles"
              value={String(lowStock)}
              caption={lowStock > 0 ? "Réapprovisionnement à prévoir" : "Aucune alerte"}
              icon={<AlertTriangle size={19} />}
              tone="amber"
              alert={lowStock > 0}
            />
            <StatCard
              title="Valeur du stock"
              value={formatFCFA(stockValue)}
              caption="Calculée au prix d’achat"
              icon={<Wallet size={19} />}
              tone="emerald"
            />
          </div>
        </section>

        {/* RECHERCHE ET FILTRES */}
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80 sm:p-5">
          <div className="mb-4 flex items-center gap-2">
            <SlidersHorizontal size={16} className="text-slate-400" />
            <h2 className="text-sm font-bold text-slate-800">Rechercher et filtrer</h2>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_260px]">
            <div className="relative">
              <Search
                size={18}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                placeholder="Rechercher par nom ou référence SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-3 pl-11 pr-4 text-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
              />
            </div>

            <div className="relative">
              <Tag
                size={16}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                                className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50/70 py-3 pl-10 pr-4 text-sm text-slate-700 outline-none transition hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
              >
                <option value="Toutes">Toutes les catégories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <span>
              <strong className="font-bold text-slate-700">{filteredProducts.length}</strong>{" "}
              résultat(s) sur {totalProducts} produit(s)
            </span>
            {(search || categoryFilter !== "Toutes") && (
              <button
                onClick={() => {
                  setSearch("");
                  setCategoryFilter("Toutes");
                }}
                className="font-semibold text-blue-700 transition hover:text-blue-900"
              >
                Effacer les filtres
              </button>
            )}
          </div>
        </section>

        {/* LISTE DES PRODUITS */}
        <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/80">
          <div className="flex flex-col justify-between gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
            <div>
              <h2 className="font-bold text-slate-900">Tous les produits</h2>
              <p className="mt-1 text-xs text-slate-500">
                Consultez et gérez les articles de votre inventaire.
              </p>
            </div>
            <span className="w-fit rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-600">
              {filteredProducts.length} affiché(s)
            </span>
          </div>

          {filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-5 py-16 text-center">
              <div className="mb-4 rounded-2xl bg-blue-50 p-4 text-blue-600">
                <PackageSearch size={28} />
              </div>
              <h3 className="font-bold text-slate-800">
                {products.length === 0 ? "Votre catalogue est vide" : "Aucun produit trouvé"}
              </h3>
              <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">
                {products.length === 0
                  ? "Ajoutez votre premier produit pour commencer à gérer votre inventaire."
                  : "Essayez une autre recherche ou modifiez les filtres sélectionnés."}
              </p>
              {products.length === 0 ? (
                <button
                  onClick={openAddForm}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-800"
                >
                  <Plus size={17} />
                  Ajouter mon premier produit
                </button>
              ) : (
                <button
                  onClick={() => {
                    setSearch("");
                    setCategoryFilter("Toutes");
                  }}
                  className="mt-5 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
                >
                  Réinitialiser les filtres
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="hidden grid-cols-[minmax(0,1.7fr)_minmax(130px,0.8fr)_minmax(130px,0.8fr)_110px] gap-4 bg-slate-50/80 px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 md:grid">
                <span>Produit</span>
                <span>Prix de vente</span>
                <span>Niveau de stock</span>
                <span className="text-right">Actions</span>
              </div>

              <div className="divide-y divide-slate-100">
                {filteredProducts.map((product) => {
                  const isLow = product.quantity <= product.minStock;

                  return (
                    <div
                      key={product.id}
                      className="grid grid-cols-1 gap-4 px-4 py-4 transition hover:bg-slate-50/80 sm:px-6 md:grid-cols-[minmax(0,1.7fr)_minmax(130px,0.8fr)_minmax(130px,0.8fr)_110px] md:items-center"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${isLow ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-700"}`}>
                          <Package size={20} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-bold text-slate-800">
                            {product.name}
                          </h3>
                          <p className="mt-1 truncate text-xs text-slate-400">
                            {product.sku} <span className="px-1">·</span> {product.category}
                          </p>
                          {product.description && (
                            <p className="mt-1 truncate text-[11px] text-slate-400">
                              {product.description}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between md:block">
                        <span className="text-[11px] font-medium text-slate-400 md:hidden">
                          Prix de vente
                        </span>
                        <p className="text-sm font-bold text-slate-800">
                          {formatFCFA(product.salePrice)}
                        </p>
                      </div>

                      <div className="flex items-center justify-between md:block">
                        <span className="text-[11px] font-medium text-slate-400 md:hidden">
                          Niveau de stock
                        </span>
                        <div className="text-right md:text-left">
                          <p className="text-sm font-bold text-slate-800">
                            {product.quantity} <span className="text-xs font-normal text-slate-400">unités</span>
                          </p>
                          <span className={`mt-1 inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${isLow ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                            {isLow ? "Stock faible" : "Disponible"}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3 md:border-0 md:pt-0">
                        <button
                          onClick={() => setQrProduct(product)}
                          aria-label={`Afficher le QR Code de ${product.name}`}
                          title="Voir le QR Code"
                          className="rounded-lg border border-slate-200 p-2.5 text-slate-500 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 focus:outline-none focus:ring-4 focus:ring-violet-500/10"
                        >
                          <QrCode size={16} />
                        </button>
                        <button
                          onClick={() => openEditForm(product)}
                          aria-label={`Modifier ${product.name}`}
                          title="Modifier"
                          className="rounded-lg border border-slate-200 p-2.5 text-slate-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/10"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => deleteProduct(product)}
                          aria-label={`Supprimer ${product.name}`}
                          title="Supprimer"
                          className="rounded-lg border border-slate-200 p-2.5 text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus:ring-4 focus:ring-rose-500/10"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>

        <footer className="flex flex-col justify-between gap-2 border-t border-slate-200 py-5 text-center text-xs text-slate-400 sm:flex-row sm:text-left">
          <p>Nexora Inventory · Données enregistrées localement</p>
          <p>Gestion intelligente de votre inventaire.</p>
        </footer>
      </div>

      {/* MODALE AJOUT / MODIFICATION */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowForm(false);
          }}
        >
          <div className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur sm:px-7">
              <div>
                <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-blue-700">
                  <Package size={13} />
                  Catalogue produits
                </div>
                <h2 className="text-lg font-extrabold text-slate-900 sm:text-xl">
                  {editingId !== null ? "Modifier le produit" : "Ajouter un produit"}
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Renseignez les informations de votre article.
                </p>
              </div>
              <button
                onClick={() => setShowForm(false)}
                aria-label="Fermer le formulaire"
                className="rounded-xl bg-slate-100 p-2.5 text-slate-500 transition hover:bg-slate-200 hover:text-slate-800"
              >
                <X size={19} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 px-5 py-6 sm:px-7">
              <FormField label="Nom du produit *">
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex. : Ordinateur HP ProBook"
                  className={inputClass}
                />
              </FormField>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label="Référence SKU *">
                  <input
                    required
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    placeholder="HP-001"
                    className={inputClass}
                  />
                </FormField>

                <FormField label="Catégorie *">
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className={inputClass}
                  >
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>

              <FormField label="Description">
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Description facultative..."
                  rows={3}
                  className={`${inputClass} resize-none`}
                />
              </FormField>

              <div className="rounded-2xl bg-slate-50 p-4 sm:p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Wallet size={16} className="text-slate-500" />
                  <h3 className="text-xs font-bold text-slate-700">Informations commerciales et stock</h3>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField label="Prix d’achat (FCFA) *">
                    <input
                      required
                      type="number"
                      min="0"
                      step="1"
                      value={form.purchasePrice}
                      onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })}
                      placeholder="50000"
                      className={inputClass}
                    />
                  </FormField>

                  <FormField label="Prix de vente (FCFA) *">
                    <input
                      required
                      type="number"
                      min="0"
                      step="1"
                      value={form.salePrice}
                      onChange={(e) => setForm({ ...form, salePrice: e.target.value })}
                      placeholder="65000"
                      className={inputClass}
                    />
                  </FormField>

                  <FormField
                    label={
                      editingId !== null
                        ? "Stock actuel (géré via Mouvements)"
                        : "Quantité initiale *"
                    }
                  >
                    <input
                      required
                      type="number"
                      min="0"
                      step="1"
                      disabled={editingId !== null}
                      value={form.quantity}
                      onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                      placeholder="20"
                      className={inputClass}
                    />
                  </FormField>

                  <FormField label="Seuil d’alerte *">
                    <input
                      required
                      type="number"
                      min="0"
                      step="1"
                      value={form.minStock}
                      onChange={(e) => setForm({ ...form, minStock: e.target.value })}
                      placeholder="5"
                      className={inputClass}
                    />
                  </FormField>
                </div>
              </div>

              {error && (
                <p role="alert" className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-xs font-medium text-rose-700">
                  {error}
                </p>
              )}

              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-blue-700/20 transition hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-200"
                >
                  <Save size={17} />
                  {editingId !== null ? "Enregistrer les modifications" : "Ajouter le produit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
            {/* MODALE QR CODE PRODUIT */}
      {qrProduct && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setQrProduct(null);
          }}
        >
          <section className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-left">
                <h2 className="text-lg font-extrabold text-slate-900">QR Code du produit</h2>
                <p className="mt-1 text-xs text-slate-500">Identifiant unique Nexora</p>
              </div>
              <button
                type="button"
                onClick={() => setQrProduct(null)}
                aria-label="Fermer"
                className="rounded-xl bg-slate-100 p-2.5 text-slate-500 hover:bg-slate-200"
              >
                <X size={18} />
              </button>
            </div>

            {qrProduct.syncId ? (
              <div className="mx-auto flex w-fit flex-col items-center rounded-2xl border border-slate-200 bg-white p-4">
                <QRCodeSVG
                  id={`product-qr-${qrProduct.id}`}
                  value={`NEXORA:PRODUCT:${qrProduct.syncId}`}
                  size={220}
                  level="H"
                  includeMargin
                />
                <p className="mt-3 max-w-[220px] break-all text-[10px] text-slate-400">
                  NEXORA:PRODUCT:{qrProduct.syncId}
                </p>
              </div>
            ) : (
              <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                Identifiant QR indisponible pour ce produit. Actualisez la page et réessayez.
              </p>
            )}

            <h3 className="mt-4 text-base font-bold text-slate-900">{qrProduct.name}</h3>
            <p className="mt-1 text-sm text-slate-500">Référence : {qrProduct.sku}</p>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={!qrProduct.syncId}
                onClick={() => printProductQr(qrProduct)}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Printer size={17} />
                Imprimer l'étiquette
              </button>
              <button
                type="button"
                onClick={() => setQrProduct(null)}
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                Fermer
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10";

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function StatCard({
  title,
  value,
  caption,
  icon,
  tone,
  alert = false,
}: {
  title: string;
  value: string;
  caption: string;
  icon: ReactNode;
  tone: "blue" | "violet" | "amber" | "emerald";
  alert?: boolean;
}) {
  const tones = {
    blue: "bg-blue-50 text-blue-700",
    violet: "bg-violet-50 text-violet-700",
    amber: "bg-amber-50 text-amber-700",
    emerald: "bg-emerald-50 text-emerald-700",
  };

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80 transition hover:-translate-y-0.5 hover:shadow-md sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}>
          {icon}
        </div>
        {alert && <span className="mt-1 h-2 w-2 rounded-full bg-amber-500 ring-4 ring-amber-50" />}
      </div>
      <p className="mt-4 text-xs font-semibold text-slate-500">{title}</p>
      <p className="mt-1 break-words text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
        {value}
      </p>
      <p className={`mt-1 text-[10px] leading-4 sm:text-[11px] ${alert ? "text-amber-600" : "text-slate-400"}`}>
        {caption}
      </p>
    </div>
  );
}