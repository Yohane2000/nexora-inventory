"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { auth, firestore } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { sendPasswordResetEmail, signOut } from "firebase/auth";
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
  UserRound,
  Wifi,
  ImagePlus,
  Trash2,
  User,
  LockKeyhole,
  BadgeCheck,
  KeyRound,
  LogOut,
  Smartphone,
} from "lucide-react";

import {
  useDatabase,
  useDatabaseUid,
} from "@/lib/database/DatabaseProvider";

type CompanySettings = {
  companyName: string;
  managerName: string;
  email: string;
  phone: string;
  address: string;
  logoUrl: string;
  logoPath: string;
};

const LEGACY_STORAGE_KEY = "nexora-inventory-settings";

const defaultSettings: CompanySettings = {
  companyName: "",
  managerName: "",
  email: "",
  phone: "",
  address: "",
  logoUrl: "",
  logoPath: "",
};

export default function SettingsPage() {
  const db = useDatabase();
  const uid = useDatabaseUid();
  const storageKey = `nexora-inventory-settings-${uid}`;

  const [settings, setSettings] = useState<CompanySettings>(defaultSettings);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState("");
  const [isRestoring, setIsRestoring] = useState(false);
  const [messageIsError, setMessageIsError] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [cloudSynced, setCloudSynced] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    let active = true;

    const updateConnection = () => setIsOnline(navigator.onLine);
    updateConnection();
    window.addEventListener("offline", updateConnection);

    async function loadProfile() {
      setIsLoadingProfile(true);
      try {
        let stored = localStorage.getItem(storageKey);
        let hasPendingChanges = localStorage.getItem(`${storageKey}-pending`) === "true";

        // Migration des anciens paramètres locaux vers le compte actuellement connecté.
        if (!stored) {
          const legacyStored = localStorage.getItem(LEGACY_STORAGE_KEY);
          if (legacyStored) {
            stored = legacyStored;
            localStorage.setItem(storageKey, legacyStored);
            localStorage.setItem(`${storageKey}-pending`, "true");
            localStorage.removeItem(LEGACY_STORAGE_KEY);
            hasPendingChanges = true;
          }
        }

        if (stored && active) {
          setSettings({ ...defaultSettings, ...JSON.parse(stored) });
        }

        if (!navigator.onLine || !uid) return;

        const profileRef = doc(firestore, "users", uid, "settings", "company");

        if (hasPendingChanges && stored) {
          const localSettings = { ...defaultSettings, ...JSON.parse(stored) };
          await setDoc(profileRef, {
            ...localSettings,
            updatedAt: new Date().toISOString(),
          });
          localStorage.removeItem(`${storageKey}-pending`);
          if (active) setCloudSynced(true);
          return;
        }

        const snapshot = await getDoc(profileRef);
        if (snapshot.exists()) {
          const remoteData = snapshot.data();
          const remoteSettings: CompanySettings = {
            companyName: remoteData.companyName ?? "",
            email: remoteData.email ?? "",
            phone: remoteData.phone ?? "",
            address: remoteData.address ?? "",
            managerName: remoteData.managerName ?? "",
            logoUrl: remoteData.logoUrl ?? "",
            logoPath: remoteData.logoPath ?? "",
          };
          localStorage.setItem(storageKey, JSON.stringify(remoteSettings));
          if (active) setSettings(remoteSettings);
        }
        if (active) setCloudSynced(true);
      } catch (error) {
        console.error("[Nexora Settings] Chargement du profil impossible :", error);
        if (active) {
          setCloudSynced(false);
          setMessageIsError(true);
          setMessage("Profil chargé depuis cet appareil. La synchronisation cloud sera réessayée.");
        }
      } finally {
        if (active) setIsLoadingProfile(false);
      }
    }

    void loadProfile();
    const handleOnline = () => {
      updateConnection();
      void loadProfile();
    };
    window.addEventListener("online", handleOnline);

    return () => {
      active = false;
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
      window.removeEventListener("online", handleOnline);
    };
  }, [storageKey, uid]);

  function updateField(field: keyof CompanySettings, value: string) {
    setSettings((previous) => ({
      ...previous,
      [field]: value,
    }));
    setSaved(false);
    setMessage("");
  }

  async function saveSettings() {
    try {
      const payload = { ...settings };
      localStorage.setItem(storageKey, JSON.stringify(payload));
      localStorage.setItem(`${storageKey}-pending`, "true");
      setSaved(true);
      setMessageIsError(false);

      if (navigator.onLine && uid) {
        await setDoc(
          doc(firestore, "users", uid, "settings", "company"),
          { ...payload, updatedAt: new Date().toISOString() }
        );
        localStorage.removeItem(`${storageKey}-pending`);
        setCloudSynced(true);
        setMessage("Profil enregistré sur cet appareil et synchronisé avec votre compte.");
      } else {
        setCloudSynced(false);
        setMessage("Profil enregistré localement. Il sera synchronisé au retour de la connexion.");
      }
    } catch (error) {
      console.error("[Nexora Settings] Enregistrement cloud impossible :", error);
      setSaved(true);
      setCloudSynced(false);
      setMessageIsError(false);
      setMessage("Profil enregistré localement. La synchronisation cloud sera réessayée à la prochaine connexion.");
    }
  }

  async function sendPasswordReset() {
    const email = auth.currentUser?.email;

    if (!email) {
      setMessageIsError(true);
      setMessage("Aucune adresse e-mail n’est associée au compte connecté.");
      return;
    }

    if (!navigator.onLine) {
      setMessageIsError(true);
      setMessage("Une connexion Internet est nécessaire pour envoyer l’e-mail de réinitialisation.");
      return;
    }

    try {
      setIsSendingReset(true);
      await sendPasswordResetEmail(auth, email);
      setMessageIsError(false);
      setMessage(`Un e-mail de réinitialisation a été envoyé à ${email}. Vérifiez également vos courriers indésirables.`);
    } catch (error) {
      console.error("[Nexora Settings] Envoi de réinitialisation impossible :", error);
      setMessageIsError(true);
      setMessage("Impossible d’envoyer l’e-mail de réinitialisation. Vérifiez la connexion et réessayez.");
    } finally {
      setIsSendingReset(false);
    }
  }

  async function handleSignOut() {
    const confirmed = window.confirm("Voulez-vous vraiment vous déconnecter de Nexora Inventory ?");
    if (!confirmed) return;

    try {
      setIsSigningOut(true);
      await signOut(auth);
      window.location.href = "/connexion";
    } catch (error) {
      console.error("[Nexora Settings] Déconnexion impossible :", error);
      setMessageIsError(true);
      setMessage("La déconnexion a échoué. Veuillez réessayer.");
      setIsSigningOut(false);
    }
  }

  async function handleLogoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setMessageIsError(true);
      setMessage("Veuillez sélectionner un fichier image.");
      event.target.value = "";
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setMessageIsError(true);
      setMessage("Le fichier original ne doit pas dépasser 2 Mo.");
      event.target.value = "";
      return;
    }

    try {
      setIsUploadingLogo(true);
      setMessage("");

      // Le logo est compressé dans le navigateur puis stocké dans le document
      // Firestore. Aucune configuration Firebase Storage n'est nécessaire.
      const objectUrl = URL.createObjectURL(file);
      try {
        const image = new Image();
        image.src = objectUrl;
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error("Image illisible."));
        });

        const maxDataUrlLength = 300 * 1024;
        let logoDataUrl = "";
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Compression d'image indisponible sur cet appareil.");

        for (const maxDimension of [600, 520, 440, 360, 300]) {
          const ratio = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
          canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);

          for (const quality of [0.82, 0.72, 0.62, 0.52, 0.42]) {
            logoDataUrl = canvas.toDataURL("image/webp", quality);
            if (!logoDataUrl.startsWith("data:image/webp")) {
              logoDataUrl = canvas.toDataURL("image/jpeg", quality);
            }
            if (logoDataUrl.length <= maxDataUrlLength) break;
          }
          if (logoDataUrl.length <= maxDataUrlLength) break;
        }

        if (!logoDataUrl || logoDataUrl.length > maxDataUrlLength) {
          throw new Error("Impossible de compresser suffisamment cette image. Choisissez un logo plus simple ou moins détaillé.");
        }

        setSettings((previous) => ({
          ...previous,
          logoUrl: logoDataUrl,
          logoPath: "",
        }));
      } finally {
        URL.revokeObjectURL(objectUrl);
      }

      setSaved(false);
      setMessageIsError(false);
      setMessage("Logo ajouté et optimisé. Cliquez sur « Enregistrer » pour le synchroniser avec vos autres appareils.");
    } catch (error) {
      console.error("[Nexora Settings] Préparation du logo impossible :", error);
      setMessageIsError(true);
      setMessage(error instanceof Error ? error.message : "Impossible de préparer le logo.");
    } finally {
      setIsUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }

  function removeLogo() {
    setSettings((previous) => ({ ...previous, logoUrl: "", logoPath: "" }));
    setSaved(false);
    setMessage("Logo retiré du profil. Cliquez sur « Enregistrer » pour confirmer.");
    setMessageIsError(false);
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

        localStorage.setItem(storageKey, JSON.stringify(restoredSettings));
        localStorage.setItem(`${storageKey}-pending`, "true");
        setSettings(restoredSettings);
        setCloudSynced(false);
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
                <p className="text-sm font-semibold">{isOnline ? "Connexion disponible" : "Mode hors ligne"}</p>
                <p className="mt-0.5 text-xs text-blue-100/70">{cloudSynced ? "Profil synchronisé" : "Synchronisation en attente"}</p>
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
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Logo de l’entreprise
                  </label>
                  <div className="flex flex-col gap-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-4 sm:flex-row sm:items-center">
                    <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white">
                      {settings.logoUrl ? (
                        <img src={settings.logoUrl} alt="Logo de l’entreprise" className="h-full w-full object-contain" />
                      ) : (
                        <Building2 size={32} className="text-slate-300" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-800">
                        {settings.logoUrl ? "Logo ajouté" : "Aucun logo ajouté"}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        Image PNG, JPG ou WebP. Fichier original jusqu’à 2 Mo ; le logo est automatiquement compressé pour Firestore et partagé entre les appareils du même compte.
                      </p>
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        onChange={handleLogoChange}
                        className="hidden"
                      />
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => logoInputRef.current?.click()}
                          disabled={isUploadingLogo}
                          className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                        >
                          {isUploadingLogo ? <RefreshCw size={15} className="animate-spin" /> : <ImagePlus size={15} />}
                          {isUploadingLogo ? "Optimisation en cours…" : settings.logoUrl ? "Remplacer le logo" : "Ajouter un logo"}
                        </button>
                        {settings.logoUrl && (
                          <button
                            type="button"
                            onClick={removeLogo}
                            className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                          >
                            <Trash2 size={15} />
                            Retirer
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

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

                <div className="sm:col-span-2">
                  <label
                    htmlFor="managerName"
                    className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    Responsable de l’entreprise
                  </label>
                  <div className="relative">
                    <User
                      size={17}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      id="managerName"
                      type="text"
                      value={settings.managerName}
                      onChange={(e) => updateField("managerName", e.target.value)}
                      placeholder="Nom et prénom du responsable"
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

            {/* Compte et synchronisation */}
            <section className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700"><UserRound size={21} /></div>
                <div><h2 className="font-bold text-slate-900">Compte et synchronisation</h2><p className="mt-1 text-xs text-slate-500">Votre profil est associé à votre compte Firebase.</p></div>
              </div>
              <div className="mt-5 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Compte connecté</span><span className="max-w-[60%] truncate font-semibold text-slate-800">{auth.currentUser?.email || "Compte authentifié"}</span></div>
                <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Identifiant utilisateur</span><span className="max-w-[60%] truncate font-mono text-xs text-slate-600">{uid}</span></div>
                <div className="flex items-center justify-between gap-3"><span className="text-slate-500">État du réseau</span><span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${isOnline ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}{isOnline ? "En ligne" : "Hors ligne"}</span></div>
                <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Profil cloud</span><span className={`inline-flex items-center gap-1.5 text-xs font-bold ${cloudSynced ? "text-emerald-700" : "text-amber-700"}`}>{cloudSynced ? <CheckCircle2 size={15} /> : <RefreshCw size={15} />}{isLoadingProfile ? "Chargement…" : cloudSynced ? "Synchronisé" : "En attente"}</span></div>
              </div>
              <p className="mt-4 rounded-xl bg-blue-50 p-3 text-xs leading-5 text-blue-800">Les informations de l’entreprise sont sauvegardées localement et dans Firestore. Connectez-vous avec le même compte sur un autre appareil pour retrouver ce profil.</p>
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

            {/* Sécurité du compte */}
            <section className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-sm shadow-slate-900/[0.03]">
              <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-5 sm:px-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-50 text-rose-700">
                  <LockKeyhole size={21} />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900">Sécurité du compte</h2>
                  <p className="mt-1 text-xs text-slate-500">Contrôlez l’accès à votre compte Nexora.</p>
                </div>
              </div>

              <div className="space-y-4 p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3 rounded-2xl bg-slate-50 p-4">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Adresse e-mail du compte</p>
                    <p className="mt-1 break-all text-sm font-semibold text-slate-800">
                      {auth.currentUser?.email || "Aucune adresse disponible"}
                    </p>
                  </div>
                  <Mail size={19} className="shrink-0 text-slate-400" />
                </div>

                <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 p-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Vérification de l’adresse e-mail</p>
                    <p className="mt-1 text-xs text-slate-500">État communiqué par Firebase Authentication.</p>
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
                    auth.currentUser?.emailVerified
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-amber-50 text-amber-700"
                  }`}>
                    <BadgeCheck size={14} />
                    {auth.currentUser?.emailVerified ? "Vérifiée" : "Non vérifiée"}
                  </span>
                </div>

                <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                  <div className="flex items-start gap-3">
                    <KeyRound size={19} className="mt-0.5 shrink-0 text-blue-700" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Mot de passe</p>
                      <p className="mt-1 text-xs leading-5 text-slate-600">
                        Recevez un lien sécurisé de Firebase pour choisir un nouveau mot de passe.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={sendPasswordReset}
                    disabled={isSendingReset || !auth.currentUser?.email || !isOnline}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSendingReset ? <RefreshCw size={16} className="animate-spin" /> : <Mail size={16} />}
                    {isSendingReset ? "Envoi en cours…" : "Envoyer un e-mail de réinitialisation"}
                  </button>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <p className="mb-3 text-xs leading-5 text-slate-500">
                    Déconnectez-vous si vous utilisez un appareil partagé. Vos données synchronisées restent associées à votre compte.
                  </p>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={isSigningOut}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                  >
                    {isSigningOut ? <RefreshCw size={16} className="animate-spin" /> : <LogOut size={16} />}
                    {isSigningOut ? "Déconnexion…" : "Se déconnecter"}
                  </button>
                </div>
              </div>
            </section>

            {/* À propos et version */}
            <section className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-sm shadow-slate-900/[0.03]">
              <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-5 sm:px-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700">
                  <Info size={21} />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900">À propos de Nexora Inventory</h2>
                  <p className="mt-1 text-xs text-slate-500">Informations sur votre application.</p>
                </div>
              </div>

              <div className="space-y-4 p-5 sm:p-6">
                <div className="flex items-center gap-4 rounded-2xl bg-gradient-to-br from-[#101D3A] via-[#173B72] to-[#1765B5] p-4 text-white">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white/10">
                    {settings.logoUrl ? (
                      <img src={settings.logoUrl} alt="" className="h-full w-full object-contain" />
                    ) : (
                      <Database size={27} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-lg font-bold">{settings.companyName || "Nexora Inventory"}</p>
                    <p className="mt-1 text-xs text-blue-100">Application de gestion des stocks</p>
                    <span className="mt-2 inline-flex rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-semibold">
                      Version 0.1.0
                    </span>
                  </div>
                </div>

                <p className="text-sm leading-6 text-slate-600">
                  Nexora Inventory vous aide à gérer vos produits, suivre les mouvements de stock et consulter vos rapports, avec une approche pensée pour fonctionner même lorsque la connexion Internet est indisponible.
                </p>

                <div className="divide-y divide-slate-100 rounded-2xl border border-slate-100">
                  <div className="flex items-center justify-between gap-3 p-3.5">
                    <span className="text-sm text-slate-500">Version de l’application</span>
                    <span className="text-sm font-semibold text-slate-800">0.1.0</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 p-3.5">
                    <span className="text-sm text-slate-500">Framework</span>
                    <span className="text-sm font-semibold text-slate-800">Next.js 16.4.3</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 p-3.5">
                    <span className="text-sm text-slate-500">Interface</span>
                    <span className="text-sm font-semibold text-slate-800">React · TypeScript · Tailwind CSS</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 p-3.5">
                    <span className="text-sm text-slate-500">Données et authentification</span>
                    <span className="text-sm font-semibold text-slate-800">Dexie · Firebase</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 p-3.5">
                    <span className="text-sm text-slate-500">Mode de fonctionnement</span>
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                      <Smartphone size={15} /> PWA · Hors ligne
                    </span>
                  </div>
                </div>

                <p className="text-center text-xs leading-5 text-slate-400">
                  © 2026 Nexora Inventory. Tous droits réservés.
                </p>
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
                  <span className="font-semibold text-slate-700">Local + Firestore</span>
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
                  Le profil entreprise est synchronisé avec votre compte. Les produits et mouvements conservent leur propre mécanisme de synchronisation. Gardez également des sauvegardes JSON régulières.
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
