"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/database/db";
import {
  Plus,
  ArrowDownToLine,
  ArrowUpFromLine,
  AlertTriangle,
  TrendingUp,
  ChevronRight,
  Boxes,
  Clock,
  History,
  Package,
  BarChart3,
  Activity,
  ArrowRight,
  Wallet,
  Download,
} from "lucide-react";

const formatFCFA = (amount: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(amount) + " FCFA";

const formatDate = (date: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Africa/Brazzaville",
  }).format(new Date(date));

const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export default function Home() {
  const products = useLiveQuery(() => db.products.toArray(), [], []);
  const movements = useLiveQuery(
    () => db.movements.orderBy("createdAt").reverse().toArray(),
    [],
    []
  );

  const [currentDate, setCurrentDate] = useState("");
  const [currentYear, setCurrentYear] = useState("");
  const [weeklyActivity, setWeeklyActivity] = useState<
    { key: string; label: string; entries: number; exits: number }[]
  >([]);
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;

    setIsInstalled(standalone);
    setIsIOS(/iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase()));

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  async function handleInstallApp() {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") setInstallPrompt(null);
      return;
    }

    if (isIOS) {
      window.alert(
        "Pour installer Nexora sur iPhone : ouvrez cette page dans Safari, appuyez sur le bouton Partager, choisissez « Sur l’écran d’accueil », puis appuyez sur « Ajouter »."
      );
    }
  }

  useEffect(() => {
    const now = new Date();

    setCurrentYear(String(now.getFullYear()));
    setCurrentDate(
      new Intl.DateTimeFormat("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Africa/Brazzaville",
      }).format(now)
    );

    const days = Array.from({ length: 7 }, (_, index) => {
      const day = new Date(now);
      day.setDate(now.getDate() - (6 - index));

      return {
        key: dateKey(day),
        label: new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(day),
        entries: 0,
        exits: 0,
      };
    });

    movements.forEach((movement) => {
      const key = dateKey(new Date(movement.createdAt));
      const day = days.find((item) => item.key === key);

      if (!day) return;
      if (movement.type === "ENTREE") day.entries += 1;
      else if (movement.type === "SORTIE") day.exits += 1;
    });

    setWeeklyActivity(days);
  }, [movements]);

  const totalProducts = products.length;
  const totalQuantity = products.reduce((sum, product) => sum + product.quantity, 0);
  const stockValue = products.reduce(
    (sum, product) => sum + product.purchasePrice * product.quantity,
    0
  );
  const lowStockProducts = products.filter(
    (product) => product.quantity <= product.minStock
  );
  const totalEntries = movements.filter((movement) => movement.type === "ENTREE").length;
  const totalExits = movements.filter((movement) => movement.type === "SORTIE").length;
  const totalMovements = movements.length;

  const productsToWatch = [...lowStockProducts]
    .sort((a, b) => a.quantity - b.quantity)
    .slice(0, 5);

  const recentMovements = movements.slice(0, 5);

  const maxActivity = Math.max(
    1,
    ...weeklyActivity.map((day) => day.entries + day.exits)
  );

  return (
    <main className="min-h-screen bg-[#F5F7FB] text-slate-900">
      <div className="mx-auto w-full max-w-[1440px] space-y-7 p-4 sm:p-6 lg:p-8">
        {/* INTRODUCTION */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#123A8C] via-[#174DB5] to-[#2563EB] p-6 text-white shadow-xl shadow-blue-900/10 sm:p-8">
          <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full border-[36px] border-white/5" />
          <div className="pointer-events-none absolute -bottom-32 right-1/4 h-64 w-64 rounded-full bg-white/5 blur-2xl" />

          <div className="relative flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div className="max-w-2xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-blue-100 backdrop-blur">
                <Activity size={14} />
                Espace de pilotage
              </div>
              <p className="text-sm capitalize text-blue-100">
                {currentDate || "Chargement..."}
              </p>
              <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
                Bonjour, Yohane
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-blue-100 sm:text-base">
                Retrouvez en un coup d’œil l’état de votre inventaire et les dernières opérations.
              </p>
            </div>

            <div className="flex shrink-0 flex-col gap-3 sm:items-end">
              <Link
                href="/produits"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-blue-800 shadow-lg transition hover:-translate-y-0.5 hover:bg-blue-50"
              >
                <Plus size={18} />
                Ajouter un produit
              </Link>
              {!isInstalled && (installPrompt || isIOS) && (
                <button
                  type="button"
                  onClick={handleInstallApp}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/10 px-5 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
                >
                  <Download size={17} />
                  Installer Nexora
                </button>
              )}
            </div>
          </div>
        </section>

        {/* KPI PRINCIPAUX */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Vue d’ensemble</h2>
              <p className="mt-1 text-xs text-slate-500">Les indicateurs clés de votre stock</p>
            </div>
            <span className="hidden rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200 sm:inline-flex">
              Données en temps réel
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="relative overflow-hidden rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80 sm:col-span-2 xl:col-span-1">
              <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-blue-50" />
              <div className="relative flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500">Valeur du stock</p>
                  <h3 className="mt-3 break-words text-2xl font-extrabold tracking-tight text-slate-900">
                    {formatFCFA(stockValue)}
                  </h3>
                  <p className="mt-2 text-[11px] text-slate-400">Basée sur les prix d’achat</p>
                </div>
                <div className="rounded-xl bg-blue-600 p-3 text-white shadow-lg shadow-blue-600/20">
                  <Wallet size={20} />
                </div>
              </div>
            </div>

            <KpiCard
              label="Produits enregistrés"
              value={String(totalProducts)}
              detail={`${totalQuantity} unités en stock`}
              icon={<Package size={20} />}
              iconClass="bg-indigo-50 text-indigo-600"
            />
            <KpiCard
              label="Stocks faibles"
              value={String(lowStockProducts.length)}
              detail={lowStockProducts.length > 0 ? "Réapprovisionnement à prévoir" : "Aucune alerte actuellement"}
              icon={<AlertTriangle size={20} />}
              iconClass="bg-amber-50 text-amber-600"
              alert={lowStockProducts.length > 0}
            />
            <KpiCard
              label="Mouvements enregistrés"
              value={String(totalMovements)}
              detail={`${totalEntries} entrées · ${totalExits} sorties`}
              icon={<History size={20} />}
              iconClass="bg-violet-50 text-violet-600"
            />
          </div>
        </section>

        {/* ACTIONS RAPIDES — au-dessus des indicateurs de stock */}
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80 sm:p-6">
          <h2 className="font-bold text-slate-900">Actions rapides</h2>
          <p className="mt-1 text-xs text-slate-500">
            Accédez directement aux opérations courantes
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <QuickAction href="/mouvements" label="Entrée de stock" icon={<ArrowDownToLine size={19} />} tone="emerald" />
            <QuickAction href="/mouvements" label="Sortie de stock" icon={<ArrowUpFromLine size={19} />} tone="rose" />
            <QuickAction href="/produits" label="Nouveau produit" icon={<Plus size={19} />} tone="blue" />
            <QuickAction href="/rapports" label="Voir les rapports" icon={<BarChart3 size={19} />} tone="violet" />
          </div>
        </section>

        {/* ACTIVITÉ DE LA SEMAINE */}
        <section>
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-slate-900">Activité de la semaine</h2>
                <p className="mt-1 text-xs text-slate-500">Nombre d’opérations sur les 7 derniers jours</p>
              </div>
              <div className="flex items-center gap-4 text-[11px] font-medium text-slate-500">
                <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-emerald-500" /> Entrées</span>
                <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-rose-500" /> Sorties</span>
              </div>
            </div>

            <div className="mt-7 grid h-40 grid-cols-7 items-end gap-2 sm:gap-4">
              {weeklyActivity.map((day) => {
                const total = day.entries + day.exits;
                const height = total === 0 ? 4 : Math.max(10, (total / maxActivity) * 100);
                const entryHeight = total === 0 ? 0 : (day.entries / total) * height;
                const exitHeight = total === 0 ? 0 : (day.exits / total) * height;

                return (
                  <div key={day.key} className="flex h-full flex-col items-center justify-end gap-2">
                    <div className="flex h-full w-full items-end justify-center">
                      <div
                        className="flex w-full max-w-10 flex-col justify-end overflow-hidden rounded-t-lg bg-slate-100"
                        style={{ height: `${height}%` }}
                        title={`${day.entries} entrées, ${day.exits} sorties`}
                      >
                        {day.entries > 0 && (
                          <div className="w-full bg-emerald-500" style={{ height: `${(entryHeight / height) * 100}%` }} />
                        )}
                        {day.exits > 0 && (
                          <div className="w-full bg-rose-500" style={{ height: `${(exitHeight / height) * 100}%` }} />
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] font-medium capitalize text-slate-400">{day.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

        </section>

        {/* ALERTES ET HISTORIQUE */}
        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/80">
            <div className="flex items-center justify-between border-b border-slate-100 p-5 sm:px-6">
              <div>
                <h2 className="font-bold text-slate-900">Produits à surveiller</h2>
                <p className="mt-1 text-xs text-slate-500">Articles proches ou en dessous du seuil minimum</p>
              </div>
              <Link href="/produits" className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:text-blue-900">
                Voir tout <ArrowRight size={14} />
              </Link>
            </div>

            {productsToWatch.length === 0 ? (
              <EmptyState
                icon={<Package size={23} />}
                title="Aucun stock faible"
                description="Tous vos produits respectent leur seuil minimum."
                tone="emerald"
              />
            ) : (
              <div className="divide-y divide-slate-100">
                {productsToWatch.map((product) => {
                  const percentage = product.minStock > 0
                    ? Math.min(100, (product.quantity / product.minStock) * 100)
                    : 100;

                  return (
                    <div key={product.id} className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                          <Package size={18} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">{product.name}</p>
                          <p className="mt-1 truncate text-xs text-slate-400">{product.category}</p>
                        </div>
                      </div>
                      <div className="w-28 shrink-0 text-right">
                        <p className="text-sm font-bold text-slate-800">{product.quantity} <span className="text-xs font-normal text-slate-400">unités</span></p>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-amber-500" style={{ width: `${percentage}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <Link href="/produits" className="flex items-center justify-center gap-2 border-t border-slate-100 py-4 text-xs font-bold text-blue-700 transition hover:bg-slate-50">
              Consulter les produits <ChevronRight size={15} />
            </Link>
          </div>

          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/80">
            <div className="flex items-center justify-between border-b border-slate-100 p-5 sm:px-6">
              <div>
                <h2 className="font-bold text-slate-900">Derniers mouvements</h2>
                <p className="mt-1 text-xs text-slate-500">Les cinq opérations les plus récentes</p>
              </div>
              <Link href="/mouvements" className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:text-blue-900">
                Historique <ArrowRight size={14} />
              </Link>
            </div>

            {recentMovements.length === 0 ? (
              <EmptyState
                icon={<History size={23} />}
                title="Aucun mouvement"
                description="Vos prochaines opérations apparaîtront ici."
                tone="blue"
              />
            ) : (
              <div className="divide-y divide-slate-100">
                {recentMovements.map((movement) => {
                  const isEntry = movement.type === "ENTREE";
                  return (
                    <div key={movement.id} className="flex items-center justify-between gap-3 px-5 py-4 sm:px-6">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isEntry ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
                          {isEntry ? <ArrowDownToLine size={18} /> : <ArrowUpFromLine size={18} />}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">{movement.productName}</p>
                          <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
                            <Clock size={11} />
                            {formatDate(movement.createdAt)}
                          </p>
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-bold ${isEntry ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                        {isEntry ? "+" : "−"}{movement.quantity}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <Link href="/mouvements" className="flex items-center justify-center gap-2 border-t border-slate-100 py-4 text-xs font-bold text-blue-700 transition hover:bg-slate-50">
              Tous les mouvements <ChevronRight size={15} />
            </Link>
          </div>
        </section>

        <footer className="flex flex-col justify-between gap-2 border-t border-slate-200 py-5 text-xs text-slate-400 sm:flex-row">
          <p>© {currentYear} Nexora Inventory. Tous droits réservés.</p>
          <p>Gestion intelligente de votre inventaire.</p>
        </footer>
      </div>
    </main>
  );
}

function KpiCard({
  label,
  value,
  detail,
  icon,
  iconClass,
  alert = false,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  iconClass: string;
  alert?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className={`rounded-xl p-3 ${iconClass}`}>{icon}</div>
        {alert && <span className="mt-1 h-2 w-2 rounded-full bg-amber-500 ring-4 ring-amber-50" />}
      </div>
      <p className="mt-4 text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">{value}</p>
      <p className={`mt-1 text-[11px] ${alert ? "text-amber-600" : "text-slate-400"}`}>{detail}</p>
    </div>
  );
}

function QuickAction({
  href,
  label,
  icon,
  tone,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  tone: "emerald" | "rose" | "blue" | "violet";
}) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100",
    rose: "bg-rose-50 text-rose-600 group-hover:bg-rose-100",
    blue: "bg-blue-50 text-blue-600 group-hover:bg-blue-100",
    violet: "bg-violet-50 text-violet-600 group-hover:bg-violet-100",
  };

  return (
    <Link
      href={href}
      className="group flex min-h-24 flex-col justify-between rounded-xl border border-slate-200 p-3 transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/40 sm:p-4"
    >
      <span className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${tones[tone]}`}>
        {icon}
      </span>
      <span className="mt-3 text-xs font-semibold leading-5 text-slate-700">{label}</span>
    </Link>
  );
}

function EmptyState({
  icon,
  title,
  description,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  tone: "emerald" | "blue";
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center px-5 py-8 text-center">
      <div className={`mb-3 rounded-xl p-3 ${tone === "emerald" ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"}`}>
        {icon}
      </div>
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      <p className="mt-1 max-w-xs text-xs leading-5 text-slate-400">{description}</p>
    </div>
  );
}
