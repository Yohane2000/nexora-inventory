"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  Building2,
  Save,
  Download,
  Upload,
  Database,
  Settings,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  Mail,
  Phone,
  MapPin,
  HardDrive,
  FileJson,
  Sparkles,
  WifiOff,
  CircleCheck,
  Info,
} from "lucide-react";

import { db } from "@/lib/database/db";

type CompanySettings = {
  companyName: string;
  email: string;
  phone: string;
  address: string;
};

const STORAGE_KEY = "nexora-inventory-settings";

const defaultSettings: CompanySettings = {
  companyName: "",
  email: "",
  phone: "",
  address: "",
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<CompanySettings>(defaultSettings);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState("");
  const [isRestoring, setIsRestoring] = useState(false);
  const [messageIsError, setMessageIsError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);

      if (stored) {
        setSettings({
          ...defaultSettings,
          ...JSON.parse(stored),
        });
      }
    } catch {
      setMessageIsError(true);
      setMessage("Impossible de charger les paramètres.");
    }
  }, []);

  function updateField(field: keyof CompanySettings, value: string) {
    setSettings((previous) => ({
      ...previous,
      [field]: value,
    }));
    setSaved(false);
    setMessage("");
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      setSaved(true);
      setMessageIsError(false);
      setMessage("Les informations de votre entreprise ont été enregistrées.");
    } catch {
      setSaved(false);
      setMessageIsError(true);
      setMessage("Erreur lors de l'enregistrement des paramètres.");
    }
  }

  async function exportBackup() {
    try {
      const products = await db.products.toArray();
      const movements = await db.movements.toArray();

      const backup = {
        application: "Nexora Inventory",
        version: 1,
        exportedAt: new Date().toISOString(),
        settings,
        products,
        movements,
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json",
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = `nexora-backup-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;

      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setMessageIsError(false);
      setMessage("Votre sauvegarde a été téléchargée avec succès.");
    } catch {
      setMessageIsError(true);
      setMessage("Impossible de créer la sauvegarde.");
    }
  }

  async function restoreBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    try {
      setIsRestoring(true);
      setMessage("");

      const text = await file.text();
      const backup = JSON.parse(text);

      if (
        backup.application !== "Nexora Inventory" ||
        !Array.isArray(backup.products) ||
        !Array.isArray(backup.movements)
      ) {
        throw new Error("Fichier de sauvegarde invalide.");
      }

      const validProducts = backup.products.every(
        (product: any) =>
          typeof product.name === "string" &&
          typeof product.sku === "string" &&
          typeof product.quantity === "number"
      );

      const validMovements = backup.movements.every(
        (movement: any) =>
          typeof movement.productId === "number" &&
          typeof movement.quantity === "number" &&
          (movement.type === "ENTREE" || movement.type === "SORTIE")
      );

      if (!validProducts || !validMovements) {
        throw new Error("Les données du fichier sont invalides.");
      }

      const confirmed = window.confirm(
        "Attention : la restauration remplacera tous les produits et mouvements actuellement enregistrés sur cet appareil. Continuer ?"
      );

      if (!confirmed) return;

      await db.transaction(
        "rw",
        db.products,
        db.movements,
        async () => {
          await db.products.clear();
          await db.movements.clear();

          await db.products.bulkPut(backup.products);
          await db.movements.bulkPut(backup.movements);
        }
      );

      if (backup.settings) {
        const restoredSettings = {
          ...defaultSettings,
          ...backup.settings,
        };

        localStorage.setItem(STORAGE_KEY, JSON.stringify(restoredSettings));
        setSettings(restoredSettings);
      }

      setMessageIsError(false);
      setMessage("Sauvegarde restaurée avec succès. Vos données sont à jour.");
    } catch (error) {
      setMessageIsError(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Erreur pendant la restauration."
      );
    } finally {
      setIsRestoring(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  return (
    <main className="min-h-screen bg-[#F4F7FC] pb-12">
      <div className="mx-auto max-w-6xl space-y-7 p-4 sm:p-6 lg:p-8">
        {/* En-tête */}
        <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#101D3A] via-[#173B72] to-[#1765B5] p-6 text-white shadow-xl shadow-blue-950/10 sm:p-8">
          <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full border-[35px] border-white/5" />
          <div className="pointer-events-none absolute -bottom-28 right-1/4 h-64 w-64 rounded-full bg-cyan-300/10 blur-3xl" />

          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-blue-100">
                <Settings size={14} />
                ESPACE ADMINISTRATION
              </div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Paramètres
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-blue-100/80 sm:text-base">
                Configurez les informations de votre entreprise et gérez la
                sécurité de vos données d’inventaire.
              </p>
            </div>

            <div className="flex w-fit items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-300">
                <ShieldCheck size={21} />
              </div>
              <div>
                <p className="text-sm font-semibold">Données locales</p>
                <p className="mt-0.5 text-xs text-blue-100/70">
                  Stockage sur cet appareil
                </p>
              </div>
            </div>
          </div>
        </section>

        {message && (
          <div
            role="status"
            className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${
              messageIsError
                ? "border-rose-200 bg-rose-50 text-rose-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            {messageIsError ? (
              <AlertTriangle size={19} className="mt-0.5 shrink-0" />
            ) : (
              <CheckCircle2 size={19} className="mt-0.5 shrink-0" />
            )}
            <p>{message}</p>
          </div>
        )}

        <div className="grid items-start gap-7 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-7">
            {/* Informations entreprise */}
            <section className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-sm shadow-slate-900/[0.03]">
              <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-5 sm:px-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                  <Building2 size={21} />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900">
                    Informations de l’entreprise
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Ces informations décrivent votre structure.
                  </p>
                </div>
              </div>

              <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="companyName"
                    className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    Nom de l’entreprise
                  </label>
                  <div className="relative">
                    <Building2
                      size={17}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      id="companyName"
                      type="text"
                      value={settings.companyName}
                      onChange={(e) =>
                        updateField("companyName", e.target.value)
                      }
                      placeholder="Ex : Nexora Solutions"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-3.5 pl-11 pr-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="companyEmail"
                    className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    Adresse e-mail
                  </label>
                  <div className="relative">
                    <Mail
                      size={17}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      id="companyEmail"
                      type="email"
                      value={settings.email}
                      onChange={(e) => updateField("email", e.target.value)}
                      placeholder="contact@entreprise.com"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-3.5 pl-11 pr-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="companyPhone"
                    className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    Téléphone
                  </label>
                  <div className="relative">
                    <Phone
                      size={17}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      id="companyPhone"
                      type="tel"
                      value={settings.phone}
                      onChange={(e) => updateField("phone", e.target.value)}
                      placeholder="+242 06 000 00 00"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-3.5 pl-11 pr-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="companyAddress"
                    className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    Adresse
                  </label>
                  <div className="relative">
                    <MapPin
                      size={17}
                      className="absolute left-4 top-4 text-slate-400"
                    />
                    <textarea
                      id="companyAddress"
                      rows={3}
                      value={settings.address}
                      onChange={(e) => updateField("address", e.target.value)}
                      placeholder="Adresse de votre entreprise..."
                      className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50/70 py-3.5 pl-11 pr-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <p className="text-xs text-slate-400">
                  Les modifications doivent être enregistrées.
                </p>
                <button
                  onClick={saveSettings}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-700/15 transition hover:-translate-y-0.5 hover:bg-blue-800"
                >
                  {saved ? <CircleCheck size={17} /> : <Save size={17} />}
                  {saved ? "Modifications enregistrées" : "Enregistrer"}
                </button>
              </div>
            </section>

            {/* Préférences */}
            <section className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-sm shadow-slate-900/[0.03]">
              <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-5 sm:px-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
                  <Settings size={21} />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900">
                    Préférences générales
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Environnement et paramètres régionaux.
                  </p>
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                <div className="flex items-center justify-between gap-4 px-5 py-5 sm:px-6">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      Devise
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Devise utilisée pour les valeurs du stock.
                    </p>
                  </div>
                  <span className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-700">
                    FCFA
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4 px-5 py-5 sm:px-6">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      Langue
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Langue actuelle de l’interface.
                    </p>
                  </div>
                  <span className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-700">
                    Français
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4 px-5 py-5 sm:px-6">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      Fonctionnement
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      L’application conserve les données sur cet appareil.
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
                    <WifiOff size={14} />
                    Hors ligne
                  </span>
                </div>
              </div>
            </section>
          </div>

          <div className="space-y-7">
            {/* Sauvegarde */}
            <section className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-sm shadow-slate-900/[0.03]">
              <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-5 sm:px-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                  <Database size={21} />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900">
                    Sauvegarde des données
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Exportez ou restaurez votre inventaire.
                  </p>
                </div>
              </div>

              <div className="space-y-4 p-5 sm:p-6">
                <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-5">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                    <Download size={21} />
                  </div>
                  <h3 className="font-bold text-slate-900">
                    Exporter une sauvegarde
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Téléchargez vos produits, mouvements et paramètres dans un
                    fichier JSON que vous pourrez conserver.
                  </p>
                  <button
                    onClick={exportBackup}
                    className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-800"
                  >
                    <Download size={17} />
                    Télécharger la sauvegarde
                  </button>
                </div>

                <div className="rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50/80 to-white p-5">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-orange-100 text-orange-700">
                    <Upload size={21} />
                  </div>
                  <h3 className="font-bold text-slate-900">
                    Restaurer une sauvegarde
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Importez un fichier JSON Nexora précédemment exporté pour
                    retrouver vos données.
                  </p>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={restoreBackup}
                    className="hidden"
                    id="backup-file"
                  />

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isRestoring}
                    className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-orange-200 bg-white px-4 py-3 text-sm font-semibold text-orange-800 transition hover:bg-orange-100/70 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isRestoring ? (
                      <RefreshCw size={17} className="animate-spin" />
                    ) : (
                      <Upload size={17} />
                    )}
                    {isRestoring ? "Restauration en cours..." : "Importer un fichier"}
                  </button>
                </div>

                <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <AlertTriangle
                    size={18}
                    className="mt-0.5 shrink-0 text-amber-700"
                  />
                  <p className="text-xs leading-5 text-amber-900">
                    La restauration remplace les produits et mouvements
                    actuellement présents sur cet appareil. Exportez une
                    sauvegarde récente avant de continuer.
                  </p>
                </div>
              </div>
            </section>

            {/* Information stockage */}
            <section className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-900/[0.03] sm:p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                  <HardDrive size={19} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Stockage de l’application
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Fonctionnement local et autonome
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-500">Base de données</span>
                  <span className="font-semibold text-slate-700">IndexedDB</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-500">Paramètres</span>
                  <span className="font-semibold text-slate-700">Stockage local</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-500">Format de sauvegarde</span>
                  <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                    <FileJson size={15} className="text-emerald-600" />
                    JSON
                  </span>
                </div>
              </div>
              <div className="mt-5 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">
                <Info size={15} className="mt-0.5 shrink-0 text-blue-600" />
                <p>
                  Les données locales ne sont pas automatiquement synchronisées
                  entre plusieurs appareils. Conservez régulièrement une copie
                  de sauvegarde.
                </p>
              </div>
            </section>

            <div className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
              <Sparkles size={19} className="shrink-0 text-blue-700" />
              <p className="text-xs leading-5 text-blue-900">
                <span className="font-semibold">Nexora Inventory</span> ·
                Gestion simple, claire et maîtrisée de votre inventaire.
              </p>
            </div>
          </div>
        </div>

        <footer className="border-t border-slate-200 pt-6 text-center text-xs text-slate-400">
          Nexora Inventory · Centre de configuration
        </footer>
      </div>
    </main>
  );
}
