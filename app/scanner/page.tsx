"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { useDatabase } from "@/lib/database/DatabaseProvider";
import type { Product, MovementType } from "@/lib/database/db";

import {
ScanLine,
Camera,
CameraOff,
Package,
ArrowDownToLine,
ArrowUpFromLine,
CheckCircle2,
AlertCircle,
RefreshCw,
X,
Save,
Wifi,
WifiOff,
} from "lucide-react";

const QR_PREFIX = "NEXORA:PRODUCT:";

export default function ScannerPage() {
const db = useDatabase();

const scannerRef = useRef<Html5Qrcode | null>(null);
const startingRef = useRef(false);
const scanLock = useRef(false);

const [scanning, setScanning] = useState(false);
const [loadingProduct, setLoadingProduct] = useState(false);
const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

const [movementType, setMovementType] =
useState<MovementType>("ENTREE");

const [quantity, setQuantity] = useState("1");
const [reason, setReason] = useState("Approvisionnement");
const [note, setNote] = useState("");

const [error, setError] = useState("");
const [success, setSuccess] = useState("");
const [saving, setSaving] = useState(false);
const [isOnline, setIsOnline] = useState(true);

// ==========================================
// ÉTAT INTERNET
// ==========================================

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

// ==========================================
// ARRÊT DU SCANNER
// ==========================================

const stopScanner = useCallback(async () => {
const scanner = scannerRef.current;


if (!scanner) {
  setScanning(false);
  return;
}

try {
  if (scanner.isScanning) {
    await scanner.stop();
  }
} catch (err) {
  console.warn("Arrêt du scanner :", err);
}

try {
  scanner.clear();
} catch (err) {
  console.warn("Nettoyage du scanner :", err);
}

scannerRef.current = null;
setScanning(false);


}, []);

// ==========================================
// RECHERCHE DU PRODUIT
// ==========================================

const handleScan = useCallback(
async (decodedText: string) => {
if (scanLock.current) return;


  scanLock.current = true;
  setLoadingProduct(true);
  setError("");
  setSuccess("");

  await stopScanner();

  try {
    if (!decodedText.startsWith(QR_PREFIX)) {
      throw new Error(
        "Ce QR Code ne correspond pas à un produit Nexora."
      );
    }

    const syncId = decodedText.slice(QR_PREFIX.length).trim();

    if (!syncId) {
      throw new Error("Identifiant produit invalide.");
    }

    const product = await db.products
      .where("syncId")
      .equals(syncId)
      .first();

    if (!product) {
      throw new Error(
        "Produit introuvable dans cet inventaire. Vérifiez que le produit est synchronisé ou présent sur cet appareil."
      );
    }

    setSelectedProduct(product);
    setQuantity("1");
    setMovementType("ENTREE");
    setReason("Approvisionnement");
    setNote("");
  } catch (err) {
    setError(
      err instanceof Error
        ? err.message
        : "Impossible de retrouver le produit."
    );

    scanLock.current = false;
  } finally {
    setLoadingProduct(false);
  }
},
[db, stopScanner]


);

// ==========================================
// DÉMARRAGE DE LA CAMÉRA
// ==========================================

async function startScanner() {
  // Évite de créer plusieurs instances, notamment avec React Strict Mode.
  if (scannerRef.current || startingRef.current) return;

  startingRef.current = true;
  setError("");
setSuccess("");
setSelectedProduct(null);


scanLock.current = false;

try {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      "La caméra nécessite une connexion HTTPS ou un environnement sécurisé."
    );
  }

  const scanner = new Html5Qrcode("qr-reader");

  // On conserve immédiatement la référence pour bloquer les démarrages concurrents.
  scannerRef.current = scanner;

  await scanner.start(
    { facingMode: "environment" },
    {
      fps: 10,
      qrbox: {
        width: 250,
        height: 250,
      },
      aspectRatio: 1,
    },
    (decodedText) => {
      void handleScan(decodedText);
    },
    () => {
      // Aucune action lorsqu'aucun QR Code n'est détecté.
    }
  );

  setScanning(true);
} catch (err) {
  const scanner = scannerRef.current;

  if (scanner) {
    try {
      if (scanner.isScanning) await scanner.stop();
      scanner.clear();
    } catch (cleanupError) {
      console.warn("Nettoyage après échec du démarrage :", cleanupError);
    }
  }

  scannerRef.current = null;
  setScanning(false);

  setError(
    err instanceof Error
      ? err.message
      : "Impossible d'activer la caméra. Vérifiez les autorisations."
  );
} finally {
  startingRef.current = false;
}

}

// ==========================================
// DÉMARRAGE AUTOMATIQUE DE LA CAMÉRA
// ==========================================

useEffect(() => {
  // Laisse React monter #qr-reader avant d'initialiser la caméra.
  const timer = window.setTimeout(() => {
    void startScanner();
  }, 150);

  return () => window.clearTimeout(timer);
}, []);

// ==========================================
// CHANGEMENT DU TYPE DE MOUVEMENT
// ==========================================

function changeMovementType(type: MovementType) {
setMovementType(type);


setReason(
  type === "ENTREE"
    ? "Approvisionnement"
    : "Vente"
);

setError("");
setSuccess("");


}

// ==========================================
// ENREGISTREMENT DU MOUVEMENT
// ==========================================

async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
e.preventDefault();


if (saving || !selectedProduct) return;

setError("");
setSuccess("");

const productId = selectedProduct.id;
const amount = Number(quantity);

if (productId === undefined) {
  setError("Identifiant du produit invalide.");
  return;
}

if (!Number.isInteger(amount) || amount <= 0) {
  setError("La quantité doit être un nombre entier positif.");
  return;
}

setSaving(true);

try {
  await db.transaction(
    "rw",
    db.products,
    db.movements,
    async () => {
      const product = await db.products.get(productId);

      if (!product || product.id === undefined) {
        throw new Error("Produit introuvable.");
      }

      const previousStock = product.quantity;

      const newStock =
        movementType === "ENTREE"
          ? previousStock + amount
          : previousStock - amount;

      if (newStock < 0) {
        throw new Error(
          `Stock insuffisant. Quantité disponible : ${previousStock}.`
        );
      }

      const now = new Date().toISOString();

      await db.products.update(productId, {
        quantity: newStock,
        updatedAt: now,
      });

      await db.movements.add({
        productId,
        productSyncId: product.syncId,
        productName: product.name,
        productSku: product.sku,
        type: movementType,
        quantity: amount,
        previousStock,
        newStock,
        reason: reason.trim(),
        note: note.trim(),
        createdAt: now,
      });
    }
  );

  setSuccess(
    `${movementType === "ENTREE" ? "Entrée" : "Sortie"} enregistrée avec succès.`
  );

  setSelectedProduct(null);
  setQuantity("1");
  setNote("");
  setReason("Approvisionnement");

  scanLock.current = false;
  window.setTimeout(() => {
    void startScanner();
  }, 150);
} catch (err) {
  setError(
    err instanceof Error
      ? err.message
      : "Une erreur est survenue pendant l'enregistrement."
  );
} finally {
  setSaving(false);
}


}

// ==========================================
// NETTOYAGE À LA FERMETURE DE LA PAGE
// ==========================================

useEffect(() => {
return () => {
const scanner = scannerRef.current;


  if (scanner) {
    if (scanner.isScanning) {
      void scanner.stop().catch(console.warn);
    }

    scannerRef.current = null;
  }
};


}, []);

// ==========================================
// INTERFACE
// ==========================================

return ( <main className="min-h-screen bg-[#F5F7FB] pb-10">


  <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">

    {/* TITRE */}

    <section>
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <ScanLine size={16} />
        Inventaire / Scanner
      </div>

      <div className="mt-2 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">

        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Scanner QR
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Scannez un produit pour gérer son stock rapidement.
          </p>
        </div>

        <div
          className={`flex w-fit items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold ${
            isOnline
              ? "bg-emerald-50 text-emerald-700"
              : "bg-orange-50 text-orange-700"
          }`}
        >
          {isOnline ? (
            <Wifi size={15} />
          ) : (
            <WifiOff size={15} />
          )}

          {isOnline ? "En ligne" : "Hors ligne"}
        </div>

      </div>
    </section>

    {/* INFORMATIONS */}

    <section className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
      <div className="flex gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
          <ScanLine size={21} />
        </div>

        <div>
          <h2 className="text-sm font-bold text-blue-900">
            Gestion rapide des stocks
          </h2>

          <p className="mt-1 text-xs leading-5 text-blue-700">
            Scannez le QR Code d'un produit. Nexora retrouvera
            automatiquement sa fiche et vous permettra
            d'enregistrer une entrée ou une sortie.
          </p>
        </div>
      </div>
    </section>

    {/* ZONE SCANNER */}

    {!selectedProduct && (

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

        <div className="flex items-center justify-between border-b border-slate-100 p-4 sm:p-5">

          <div>
            <h2 className="font-bold text-slate-900">
              Lecture du QR Code
            </h2>

            <p className="mt-1 text-xs text-slate-400">
              Utilisez la caméra arrière de votre téléphone.
            </p>
          </div>

          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            <Camera size={21} />
          </div>

        </div>

        <div className="p-4 sm:p-6">

          <div className="mx-auto max-w-md">

            <div className="relative overflow-hidden rounded-2xl bg-slate-950">

              <div
                id="qr-reader"
                className="min-h-[280px] w-full overflow-hidden"
              />

              {!scanning && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 p-6 text-center">

                  <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-800 text-blue-400">
                    <ScanLine size={42} />
                  </div>

                  <p className="text-sm font-semibold text-white">
                    Caméra inactive
                  </p>

                  <p className="mt-2 max-w-xs text-xs leading-5 text-slate-400">
La caméra va démarrer automatiquement.
                    Autorisez son accès si votre navigateur le demande.
                  </p>

                </div>
              )}

            </div>

            {scanning ? (
              <button
                type="button"
                onClick={() => void stopScanner()}
                disabled={loadingProduct}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-5 py-3.5 text-sm font-bold text-red-600 transition hover:bg-red-100 disabled:opacity-50"
              >
                <CameraOff size={19} />
                Arrêter la caméra
              </button>
            ) : error ? (
              <button
                type="button"
                onClick={() => void startScanner()}
                disabled={loadingProduct}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-700/20 transition hover:bg-blue-800 disabled:opacity-50"
              >
                <Camera size={19} />
                Réessayer
              </button>
            ) : null}

            <p className="mt-3 text-center text-[11px] text-slate-400">
              La caméra nécessite une autorisation de votre navigateur.
            </p>

          </div>

        </div>

      </section>
    )}

    {/* CHARGEMENT PRODUIT */}

    {loadingProduct && (
      <div className="flex items-center justify-center gap-3 rounded-xl border border-blue-100 bg-white p-5 text-sm font-medium text-blue-700">
        <RefreshCw size={19} className="animate-spin" />
        Recherche du produit...
      </div>
    )}

    {/* PRODUIT IDENTIFIÉ */}

    {selectedProduct && (

      <section className="space-y-5">

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

          <div className="flex items-center justify-between border-b border-slate-100 p-4 sm:p-5">

            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <Package size={23} />
              </div>

              <div>
                <p className="text-xs font-medium text-slate-400">
                  Produit identifié
                </p>

                <h2 className="font-bold text-slate-900">
                  {selectedProduct.name}
                </h2>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setSelectedProduct(null);
                setError("");
                setSuccess("");
                scanLock.current = false;
                window.setTimeout(() => {
                  void startScanner();
                }, 150);
              }}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Fermer le produit"
            >
              <X size={20} />
            </button>

          </div>

          <div className="grid grid-cols-2 gap-3 p-4 sm:p-5">

            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs text-slate-400">
                Référence SKU
              </p>

              <p className="mt-1 font-bold text-slate-800">
                {selectedProduct.sku}
              </p>
            </div>

            <div className="rounded-xl bg-blue-50 p-4">
              <p className="text-xs text-blue-600">
                Stock disponible
              </p>

              <p className="mt-1 text-xl font-extrabold text-blue-800">
                {selectedProduct.quantity}
              </p>
            </div>

            <div className="col-span-2 rounded-xl bg-slate-50 p-4">
              <p className="text-xs text-slate-400">
                Catégorie
              </p>

              <p className="mt-1 text-sm font-semibold text-slate-700">
                {selectedProduct.category}
              </p>
            </div>

          </div>

        </div>

        {/* FORMULAIRE MOUVEMENT */}

        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
        >

          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Enregistrer un mouvement
            </h2>

            <p className="mt-1 text-xs text-slate-400">
              Choisissez le type d'opération et la quantité.
            </p>
          </div>

          {/* TYPE */}

          <div className="grid grid-cols-2 gap-3">

            <button
              type="button"
              onClick={() => changeMovementType("ENTREE")}
              className={`flex items-center justify-center gap-2 rounded-xl border p-4 text-sm font-bold transition ${
                movementType === "ENTREE"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}
            >
              <ArrowDownToLine size={19} />
              Entrée
            </button>

            <button
              type="button"
              onClick={() => changeMovementType("SORTIE")}
              className={`flex items-center justify-center gap-2 rounded-xl border p-4 text-sm font-bold transition ${
                movementType === "SORTIE"
                  ? "border-red-500 bg-red-50 text-red-700"
                  : "border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}
            >
              <ArrowUpFromLine size={19} />
              Sortie
            </button>

          </div>

          {/* QUANTITÉ */}

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Quantité
            </label>

            <input
              type="number"
              min="1"
              step="1"
              required
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-lg font-bold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="Ex : 5"
            />

            <p className="mt-2 text-xs text-slate-400">
              Stock après opération :{" "}
              <strong className="text-slate-700">
                {movementType === "ENTREE"
                  ? selectedProduct.quantity + (Number(quantity) || 0)
                  : selectedProduct.quantity - (Number(quantity) || 0)}
              </strong>
            </p>
          </div>

          {/* MOTIF */}

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Motif
            </label>

            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-blue-500"
            >
              {movementType === "ENTREE" ? (
                <>
                  <option value="Approvisionnement">
                    Approvisionnement
                  </option>
                  <option value="Retour client">
                    Retour client
                  </option>
                  <option value="Correction de stock">
                    Correction de stock
                  </option>
                  <option value="Autre">Autre</option>
                </>
              ) : (
                <>
                  <option value="Vente">Vente</option>
                  <option value="Perte">Perte</option>
                  <option value="Produit endommagé">
                    Produit endommagé
                  </option>
                  <option value="Correction de stock">
                    Correction de stock
                  </option>
                  <option value="Autre">Autre</option>
                </>
              )}
            </select>
          </div>

          {/* NOTE */}

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Note complémentaire (facultatif)
            </label>

            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ajouter une précision..."
              className="w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:border-blue-500"
            />
          </div>

          {/* ERREUR */}

          {error && (
            <div className="flex gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle size={19} className="shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {/* SUCCÈS */}

          {success && (
            <div className="flex gap-2 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-700">
              <CheckCircle2 size={19} className="shrink-0" />
              <p>{success}</p>
            </div>
          )}

          {/* ACTIONS */}

          <div className="grid gap-3 sm:grid-cols-2">

            <button
              type="button"
              onClick={() => {
                setSelectedProduct(null);
                setError("");
                setSuccess("");
                scanLock.current = false;
                window.setTimeout(() => {
                  void startScanner();
                }, 150);
              }}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              <ScanLine size={18} />
              Scanner un autre produit
            </button>

            <button
              type="submit"
              disabled={saving}
              className="flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-700/20 hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <RefreshCw size={18} className="animate-spin" />
              ) : (
                <Save size={18} />
              )}

              {saving ? "Enregistrement..." : "Valider le mouvement"}
            </button>

          </div>

        </form>

      </section>
    )}

    {/* ERREUR GÉNÉRALE */}

    {error && !selectedProduct && !loadingProduct && (
      <div className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
        <AlertCircle size={20} className="shrink-0" />
        <p>{error}</p>
      </div>
    )}

    {/* SUCCÈS */}

    {success && !selectedProduct && (
      <div className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-700">
        <CheckCircle2 size={20} className="shrink-0" />
        <p>{success}</p>
      </div>
    )}

    {/* INFORMATION HORS LIGNE */}

    {!isOnline && (
      <div className="rounded-xl border border-orange-100 bg-orange-50 p-4 text-xs leading-5 text-orange-800">
        <strong>Mode hors ligne :</strong> les mouvements sont
        enregistrés localement sur cet appareil. La synchronisation
        avec Firebase reprendra lorsque la connexion sera rétablie.
      </div>
    )}

  </div>
</main>


);
}
