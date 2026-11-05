"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { useDatabase } from "@/lib/database/DatabaseProvider";
import type { Product, MovementType } from "@/lib/database/db";
import {
  ScanLine,
  Camera,
  Package,
  Plus,
  Save,
  X,
  QrCode,
  CheckCircle2,
  AlertCircle,
  Wifi,
  WifiOff,
  RefreshCw,
} from "lucide-react";

const QR_PREFIX = "NEXORA:PRODUCT:";

type BatchItem = {
  product: Product;
  quantity: string;
  reason: string;
};

export default function ScannerPage() {
  const db = useDatabase();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanRef = useRef<{ value: string; at: number }>({ value: "", at: 0 });
  const scannerModeRef = useRef<MovementType | null>(null);

  const [scannerMode, setScannerMode] = useState<MovementType | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerRunning, setScannerRunning] = useState(false);
  const [scannerError, setScannerError] = useState("");
  const [scannerMessage, setScannerMessage] = useState("");
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [savingBatch, setSavingBatch] = useState(false);
  const [batchSuccess, setBatchSuccess] = useState("");
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    scannerModeRef.current = scannerMode;
  }, [scannerMode]);

  useEffect(() => {
    const updateStatus = () => setIsOnline(navigator.onLine);
    updateStatus();
    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);
    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, []);

  const handleBatchScan = useCallback(async (decodedText: string) => {
    const now = Date.now();
    if (lastScanRef.current.value === decodedText && now - lastScanRef.current.at < 1800) return;
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
          quantity: "1",
          reason: scannerModeRef.current === "SORTIE" ? "Vente" : "Approvisionnement",
        }];
      });
    } catch {
      setScannerMessage("Impossible de rechercher ce produit dans la base locale.");
    }
  }, [db]);

  useEffect(() => {
    if (!scannerOpen || !scannerMode) return;

    let cancelled = false;
    const scanner = new Html5Qrcode("scanner-batch-qr-reader");
    scannerRef.current = scanner;
    setScannerError("");
    setScannerMessage("");
    lastScanRef.current = { value: "", at: 0 };

    scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 230, height: 230 }, aspectRatio: 1 },
      (decodedText) => { void handleBatchScan(decodedText); },
      () => undefined
    ).then(() => {
      if (!cancelled) setScannerRunning(true);
      else void scanner.stop().catch(() => undefined);
    }).catch((err: unknown) => {
      if (!cancelled) {
        setScannerError(err instanceof Error
          ? err.message
          : "Impossible d'activer la caméra. Vérifiez les autorisations.");
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
  }, [scannerOpen, scannerMode, handleBatchScan]);

  function chooseMode(type: MovementType) {
    setBatchItems([]);
    setScannerMode(type);
    setScannerError("");
    setScannerMessage("");
    setBatchSuccess("");
    setScannerOpen(true);
  }

  function closeScanner() {
    setScannerOpen(false);
    setScannerMode(null);
    setScannerRunning(false);
    setScannerError("");
    setScannerMessage("");
  }

  function updateBatchItem(productId: number | undefined, changes: Partial<Pick<BatchItem, "quantity" | "reason">>) {
    setBatchItems((current) =>
      current.map((item) => item.product.id === productId ? { ...item, ...changes } : item)
    );
  }

  async function saveBatchMovements() {
    if (savingBatch || batchItems.length === 0 || !scannerMode) return;
    setSavingBatch(true);
    setScannerError("");
    setBatchSuccess("");

    try {
      for (const item of batchItems) {
        const quantity = Number(item.quantity);
        if (!Number.isInteger(quantity) || quantity <= 0) {
          throw new Error(`Quantité invalide pour ${item.product.name}.`);
        }
      }

      await db.transaction("rw", db.products, db.movements, async () => {
        for (const item of batchItems) {
          const productId = item.product.id;
          if (productId === undefined) throw new Error(`Identifiant invalide pour ${item.product.name}.`);

          const currentProduct = await db.products.get(productId);
          if (!currentProduct) throw new Error(`Le produit ${item.product.name} n'existe plus.`);

          const quantity = Number(item.quantity);
          const previousStock = currentProduct.quantity;
          const newStock = scannerMode === "ENTREE"
            ? previousStock + quantity
            : previousStock - quantity;

          if (newStock < 0) {
            throw new Error(`Stock insuffisant pour ${currentProduct.name}. Disponible : ${previousStock}.`);
          }

          const timestamp = new Date().toISOString();
          await db.products.update(productId, { quantity: newStock, updatedAt: timestamp });
          await db.movements.add({
            productId,
            productSyncId: currentProduct.syncId,
            productName: currentProduct.name,
            productSku: currentProduct.sku,
            type: scannerMode,
            quantity,
            previousStock,
            newStock,
            purchasePriceAtMovement: currentProduct.purchasePrice,
            salePriceAtMovement: currentProduct.salePrice,
            reason: item.reason.trim() || (scannerMode === "ENTREE" ? "Approvisionnement" : "Vente"),
            note: "",
            createdAt: timestamp,
          });
        }
      });

      setBatchSuccess(`${batchItems.length} mouvement(s) enregistré(s) avec succès.`);
      setBatchItems([]);
      closeScanner();
    } catch (err) {
      setScannerError(err instanceof Error ? err.message : "Impossible d'enregistrer les mouvements.");
    } finally {
      setSavingBatch(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#F5F7FB] pb-12 text-slate-900">
      <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
        <section className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-blue-700">
              <ScanLine size={14} /> INVENTAIRE / SCANNER
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Scanner plusieurs produits</h1>
            <p className="mt-2 text-sm text-slate-500">Scannez plusieurs références dans une seule session, puis validez tous les mouvements ensemble.</p>
          </div>
          <div className={`flex w-fit items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold ${isOnline ? "bg-emerald-50 text-emerald-700" : "bg-orange-50 text-orange-700"}`}>
            {isOnline ? <Wifi size={15} /> : <WifiOff size={15} />}
            {isOnline ? "En ligne" : "Hors ligne"}
          </div>
        </section>

        {!scannerOpen && (
          <section className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5">
              <h2 className="text-lg font-bold">Quel mouvement souhaitez-vous effectuer ?</h2>
              <p className="mt-1 text-sm text-slate-500">Choisissez le type d'opération. Tous les produits scannés dans cette session utiliseront ce même choix.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => chooseMode("ENTREE")} className="flex min-h-28 items-center gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-left transition hover:bg-emerald-100">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Plus size={24} /></span>
                <span><strong className="block text-emerald-800">Entrée de stock</strong><span className="mt-1 block text-xs text-emerald-700">Ajouter des quantités au stock</span></span>
              </button>
              <button type="button" onClick={() => chooseMode("SORTIE")} className="flex min-h-28 items-center gap-4 rounded-xl border border-orange-200 bg-orange-50 p-5 text-left transition hover:bg-orange-100">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 text-orange-700"><Package size={24} /></span>
                <span><strong className="block text-orange-800">Sortie de stock</strong><span className="mt-1 block text-xs text-orange-700">Retirer des quantités du stock</span></span>
              </button>
            </div>
          </section>
        )}

        {scannerOpen && (
          <section className="grid gap-5 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm sm:p-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-bold">Scanner les produits — {scannerMode === "SORTIE" ? "Sortie de stock" : "Entrée de stock"}</h2>
                  <p className="mt-1 text-xs text-slate-500">Scannez plusieurs références pour cette même opération.</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${scannerRunning ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  {scannerRunning ? "Caméra active" : "Initialisation"}
                </span>
              </div>
              <div className="overflow-hidden rounded-2xl bg-slate-950">
                <div id="scanner-batch-qr-reader" className="min-h-[280px] w-full" />
              </div>
              {scannerError && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-medium text-rose-700">{scannerError}</p>}
              {scannerMessage && <p aria-live="polite" className="mt-3 rounded-xl bg-blue-50 p-3 text-xs font-medium text-blue-700">{scannerMessage}</p>}
              <p className="mt-3 text-[11px] leading-5 text-slate-400">Chaque produit est ajouté une seule fois. Le type de mouvement est fixé pour toute cette session ; vous pouvez ajuster les quantités avant validation.</p>
              <button type="button" onClick={closeScanner} className="mt-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">Fermer le scanner</button>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="font-bold">Session de scan</h3>
                  <p className="mt-1 text-xs text-slate-500">{batchItems.length} produit(s) ajouté(s)</p>
                </div>
                {batchItems.length > 0 && <button type="button" onClick={() => setBatchItems([])} className="text-xs font-semibold text-rose-600 hover:text-rose-700">Vider la liste</button>}
              </div>

              {batchItems.length === 0 ? (
                <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 p-5 text-center">
                  <QrCode size={28} className="mb-2 text-slate-300" />
                  <p className="text-sm font-semibold text-slate-700">Aucun produit scanné</p>
                  <p className="mt-1 text-xs text-slate-400">Présentez un QR Code Nexora devant la caméra.</p>
                </div>
              ) : (
                <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
                  {batchItems.map((item) => (
                    <div key={item.product.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-800">{item.product.name}</p>
                          <p className="mt-1 text-[11px] text-slate-400">{item.product.sku} · Stock actuel : {item.product.quantity}</p>
                        </div>
                        <button type="button" onClick={() => setBatchItems((current) => current.filter((entry) => entry.product.id !== item.product.id))} aria-label={`Retirer ${item.product.name}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><X size={16} /></button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="text-[11px] font-semibold text-slate-500">
                          Opération
                          <div className={`mt-1 rounded-lg px-2 py-2 text-xs font-bold ${scannerMode === "ENTREE" ? "bg-emerald-50 text-emerald-700" : "bg-orange-50 text-orange-700"}`}>{scannerMode === "ENTREE" ? "Entrée de stock" : "Sortie de stock"}</div>
                        </div>
                        <label className="text-[11px] font-semibold text-slate-500">
                          Quantité
                          <input type="number" min="1" step="1" inputMode="numeric" value={item.quantity} onChange={(e) => updateBatchItem(item.product.id, { quantity: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                        </label>
                      </div>
                      <label className="mt-2 block text-[11px] font-semibold text-slate-500">
                        Motif
                        <input value={item.reason} onChange={(e) => updateBatchItem(item.product.id, { reason: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 outline-none focus:border-blue-500" />
                      </label>
                    </div>
                  ))}
                </div>
              )}

              {batchItems.length > 0 && (
                <div className="mt-4 rounded-xl bg-slate-50 p-3">
                  <div className="flex justify-between text-xs text-slate-600">
                    <span>Type de mouvement</span>
                    <strong>{scannerMode === "ENTREE" ? "Entrée" : "Sortie"}</strong>
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-slate-600">
                    <span>Total de produits</span><strong>{batchItems.length}</strong>
                  </div>
                  <button type="button" onClick={saveBatchMovements} disabled={savingBatch} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-800 disabled:opacity-50">
                    {savingBatch ? <RefreshCw size={17} className="animate-spin" /> : <Save size={17} />}
                    {savingBatch ? "Enregistrement..." : "Valider tous les mouvements"}
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {scannerError && !scannerOpen && <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700"><AlertCircle size={18} />{scannerError}</div>}
        {batchSuccess && <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700"><CheckCircle2 size={18} />{batchSuccess}</div>}
        {!isOnline && <div className="rounded-xl border border-orange-100 bg-orange-50 p-4 text-xs leading-5 text-orange-800"><strong>Mode hors ligne :</strong> les mouvements sont enregistrés localement sur cet appareil. La synchronisation reprendra lorsque la connexion sera rétablie.</div>}
      </div>
    </main>
  );
}
