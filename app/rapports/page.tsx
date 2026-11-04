"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { useDatabase } from "@/lib/database/DatabaseProvider";
import {
  Package,
  Boxes,
  ArrowDownToLine,
  ArrowUpFromLine,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Download,
  CalendarDays,
  BarChart3,
  FileSpreadsheet,
  History,
  Clock3,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  RotateCcw,
  ChevronRight,
  Wifi,
  WifiOff,
} from "lucide-react";

const formatFCFA = (amount: number) =>
  `${new Intl.NumberFormat("fr-FR").format(amount)} FCFA`;

const formatNumber = (amount: number) =>
  new Intl.NumberFormat("fr-FR").format(amount);

const formatDate = (date: string) => {
  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) return "Date indisponible";

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Brazzaville",
  }).format(parsedDate);
};

export default function ReportsPage() {
  const db = useDatabase();
  const [currentDate, setCurrentDate] = useState<Date | null>(null);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setCurrentDate(new Date());

    const updateStatus = () => setIsOnline(navigator.onLine);
    updateStatus();
    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);

    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, []);

  const products = useLiveQuery(() => db.products.toArray(), [db], []);
  const movements = useLiveQuery(
    () => db.movements.orderBy("createdAt").reverse().toArray(),
    [db],
    []
  );

  const [period, setPeriod] = useState("30");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const filteredMovements = useMemo(() => {
    if (!currentDate) return [];

    let start: Date | null = null;
    let end: Date | null = null;

    if (period === "custom") {
      if (startDate) start = new Date(`${startDate}T00:00:00`);
      if (endDate) end = new Date(`${endDate}T23:59:59.999`);
    } else if (period !== "all") {
      const days = Number(period);
      start = new Date(currentDate);
      start.setDate(currentDate.getDate() - days);
      start.setHours(0, 0, 0, 0);
    }

    return movements.filter((movement) => {
      const date = new Date(movement.createdAt);
      if (start && date < start) return false;
      if (end && date > end) return false;
      return true;
    });
  }, [movements, period, startDate, endDate, currentDate]);

  const totalProducts = products.length;
  const totalQuantity = products.reduce(
    (total, product) => total + product.quantity,
    0
  );
  const stockValue = products.reduce(
    (total, product) => total + product.purchasePrice * product.quantity,
    0
  );

  // Valeur théorique du stock disponible au prix de vente
  const potentialSalesValue = products.reduce(
    (total, product) => total + product.salePrice * product.quantity,
    0
  );

  // Marge théorique : elle n'est pas un bénéfice déjà réalisé
  const potentialMargin = potentialSalesValue - stockValue;
  const potentialMarginRate =
    stockValue > 0 ? (potentialMargin / stockValue) * 100 : 0;

  const lowStock = products.filter(
    (product) => product.quantity <= product.minStock
  );

  const entries = filteredMovements.filter(
    (movement) => movement.type === "ENTREE"
  );
  const exits = filteredMovements.filter(
    (movement) => movement.type === "SORTIE"
  );

  const totalEntries = entries.reduce(
    (total, movement) => total + movement.quantity,
    0
  );
  const totalExits = exits.reduce(
    (total, movement) => total + movement.quantity,
    0
  );
  const netMovement = totalEntries - totalExits;
  const totalMovementQuantity = totalEntries + totalExits;

  const entryPercentage =
    totalMovementQuantity > 0
      ? (totalEntries / totalMovementQuantity) * 100
      : 0;
  const exitPercentage =
    totalMovementQuantity > 0
      ? (totalExits / totalMovementQuantity) * 100
      : 0;

  const topProducts = [...products]
    .sort(
      (a, b) =>
        b.purchasePrice * b.quantity - a.purchasePrice * a.quantity
    )
    .slice(0, 5);

  function resetPeriod() {
    setPeriod("30");
    setStartDate("");
    setEndDate("");
  }

  function exportCSV() {
    const headers = [
      "Date",
      "Produit",
      "Référence",
      "Type",
      "Motif",
      "Quantité",
      "Stock avant",
      "Stock après",
      "Note",
    ];

    const rows = filteredMovements.map((movement) => [
      formatDate(movement.createdAt),
      movement.productName,
      movement.productSku,
      movement.type,
      movement.reason,
      movement.quantity,
      movement.previousStock,
      movement.newStock,
      movement.note || "",
    ]);

    const escapeCSV = (value: string | number) =>
      `"${String(value).replace(/"/g, '""')}"`;

    const csvContent = [headers, ...rows]
      .map((row) => row.map(escapeCSV).join(";"))
      .join("\r\n");

    const blob = new Blob(["\uFEFF" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "nexora-rapport-mouvements.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const periodLabel =
    period === "7"
      ? "7 derniers jours"
      : period === "30"
        ? "30 derniers jours"
        : period === "90"
          ? "90 derniers jours"
          : period === "365"
            ? "12 derniers mois"
            : period === "all"
              ? "Depuis le début"
              : "Période personnalisée";

  return (
    <main className="min-h-screen bg-[#F4F7FC] pb-10">
      <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
        {/* En-tête */}
        <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-950 via-blue-950 to-blue-800 p-6 text-white shadow-xl shadow-blue-950/10 sm:p-8">
          <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full border-[36px] border-white/5" />
          <div className="pointer-events-none absolute -bottom-28 right-1/4 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-2xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-blue-100">
                <BarChart3 size={14} />
                Centre d'analyse
              </div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Rapports & statistiques
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-blue-100/80 sm:text-base">
                Comprenez l'évolution de votre inventaire, surveillez sa valeur
                et prenez vos décisions à partir de vos données.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 ${
                    isOnline
                      ? "bg-emerald-400/15 text-emerald-100"
                      : "bg-amber-300/15 text-amber-100"
                  }`}
                >
                  {isOnline ? <Wifi size={13} /> : <WifiOff size={13} />}
                  {isOnline ? "Connecté" : "Mode hors ligne"}
                </span>
                <span className="rounded-full bg-white/10 px-3 py-1.5 text-blue-100">
                  Période : {periodLabel}
                </span>
              </div>
            </div>

            <button
              onClick={exportCSV}
              disabled={filteredMovements.length === 0}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3.5 text-sm font-bold text-blue-950 shadow-lg shadow-black/10 transition hover:-translate-y-0.5 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={17} />
              Exporter les données CSV
            </button>
          </div>
        </section>

        {/* Vue d'ensemble */}
        <section>
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <Activity size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Vue d'ensemble
              </h2>
              <p className="text-xs text-slate-500">
                État actuel de votre inventaire
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Valeur du stock"
              value={formatFCFA(stockValue)}
              caption="Valorisation au prix d'achat"
              icon={<Boxes size={20} />}
              tone="blue"
            />
            <StatCard
              title="Produits référencés"
              value={formatNumber(totalProducts)}
              caption="Articles dans le catalogue"
              icon={<Package size={20} />}
              tone="violet"
            />
            <StatCard
              title="Quantité disponible"
              value={formatNumber(totalQuantity)}
              caption="Unités actuellement en stock"
              icon={<FileSpreadsheet size={20} />}
              tone="green"
            />
            <StatCard
              title="Stocks à surveiller"
              value={formatNumber(lowStock.length)}
              caption="Au seuil minimum ou en dessous"
              icon={<AlertTriangle size={20} />}
              tone="orange"
            />
          </div>
        </section>

        {/* Analyse financière */}
        <section>
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <TrendingUp size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Analyse financière
              </h2>
              <p className="text-xs text-slate-500">
                Estimation de la valeur commerciale de votre inventaire
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard
              title="Valeur potentielle de vente"
              value={formatFCFA(potentialSalesValue)}
              caption="Au prix de vente des produits disponibles"
              icon={<TrendingUp size={20} />}
              tone="green"
            />
            <StatCard
              title="Marge potentielle"
              value={formatFCFA(potentialMargin)}
              caption="Écart entre prix de vente et prix d'achat"
              icon={<Activity size={20} />}
              tone="violet"
            />
            <StatCard
              title="Taux de marge potentiel"
              value={`${potentialMarginRate.toFixed(1)} %`}
              caption="Calculé sur la valeur d'achat du stock"
              icon={<BarChart3 size={20} />}
              tone="blue"
            />
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Ces montants sont des estimations basées sur le stock actuellement disponible.
            La marge potentielle ne représente pas un bénéfice réellement encaissé.
          </p>
        </section>

        {/* Filtre de période */}
        <section className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40 sm:p-6">
          <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <CalendarDays size={19} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Période d'analyse
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Les indicateurs d'activité suivent la période sélectionnée.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={resetPeriod}
              className="inline-flex items-center gap-1.5 self-start rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 sm:self-auto"
            >
              <RotateCcw size={13} />
              Réinitialiser
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="md:col-span-1">
              <span className="mb-2 block text-xs font-semibold text-slate-600">
                Sélectionner une période
              </span>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
              >
                <option value="7">7 derniers jours</option>
                <option value="30">30 derniers jours</option>
                <option value="90">90 derniers jours</option>
                <option value="365">12 derniers mois</option>
                <option value="all">Depuis le début</option>
                <option value="custom">Personnaliser</option>
              </select>
            </label>

            {period === "custom" ? (
              <>
                <label>
                  <span className="mb-2 block text-xs font-semibold text-slate-600">
                    Date de début
                  </span>
                  <input
                    type="date"
                    value={startDate}
                    max={endDate || undefined}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                  />
                </label>
                <label>
                  <span className="mb-2 block text-xs font-semibold text-slate-600">
                    Date de fin
                  </span>
                  <input
                    type="date"
                    min={startDate || undefined}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                  />
                </label>
              </>
            ) : (
              <div className="flex items-center rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500 md:col-span-2">
                <Clock3 size={15} className="mr-2 shrink-0 text-slate-400" />
                Analyse des mouvements :{" "}
                <strong className="ml-1 text-slate-700">{periodLabel}</strong>
              </div>
            )}
          </div>
        </section>

        {/* Activité de stock */}
        <section>
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
              <ArrowLeftRightIcon />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Activité de stock
              </h2>
              <p className="text-xs text-slate-500">
                Volumes enregistrés sur la période sélectionnée
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <ActivityCard
              title="Entrées"
              value={formatNumber(totalEntries)}
              subtitle={`${formatNumber(entries.length)} opération(s)`}
              icon={<ArrowDownToLine size={19} />}
              tone="green"
            />
            <ActivityCard
              title="Sorties"
              value={formatNumber(totalExits)}
              subtitle={`${formatNumber(exits.length)} opération(s)`}
              icon={<ArrowUpFromLine size={19} />}
              tone="orange"
            />
            <ActivityCard
              title="Solde des mouvements"
              value={`${netMovement > 0 ? "+" : netMovement < 0 ? "−" : ""}${formatNumber(
                Math.abs(netMovement)
              )}`}
              subtitle="Différence entre entrées et sorties"
              icon={
                netMovement >= 0 ? (
                  <TrendingUp size={19} />
                ) : (
                  <TrendingDown size={19} />
                )
              }
              tone={netMovement >= 0 ? "blue" : "orange"}
            />
          </div>
        </section>

        {/* Répartition des mouvements */}
        <section className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40 sm:p-6">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Répartition des mouvements
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Comparaison des quantités entrées et sorties.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-500">
              <BarChart3 size={13} />
              {formatNumber(totalMovementQuantity)} unités
            </span>
          </div>

          <div className="mt-7 space-y-6">
            <DistributionBar
              title="Entrées"
              amount={totalEntries}
              percentage={entryPercentage}
              tone="green"
            />
            <DistributionBar
              title="Sorties"
              amount={totalExits}
              percentage={exitPercentage}
              tone="orange"
            />
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-4 text-xs text-slate-500">
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              Entrées : {entryPercentage.toFixed(1)} %
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
              Sorties : {exitPercentage.toFixed(1)} %
            </span>
          </div>
        </section>

        {/* Produits à forte valeur */}
        <section className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
                <Boxes size={19} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Produits à plus forte valeur
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Classement selon le prix d'achat et le stock disponible.
                </p>
              </div>
            </div>
            <Link
              href="/produits"
              className="hidden items-center gap-1 text-xs font-bold text-blue-700 transition hover:text-blue-900 sm:inline-flex"
            >
              Catalogue <ChevronRight size={14} />
            </Link>
          </div>

          {topProducts.length === 0 ? (
            <EmptyState
              icon={<Package size={22} />}
              title="Aucun produit enregistré"
              description="Ajoutez des produits pour voir leur valorisation ici."
            />
          ) : (
            <div className="divide-y divide-slate-100">
              {topProducts.map((product, index) => {
                const value = product.purchasePrice * product.quantity;
                const maxValue = Math.max(
                  ...topProducts.map((item) => item.purchasePrice * item.quantity),
                  1
                );
                const width = (value / maxValue) * 100;

                return (
                  <div
                    key={product.id}
                    className="flex items-center gap-3 px-5 py-4 sm:px-6"
                  >
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-extrabold ${
                        index === 0
                          ? "bg-blue-100 text-blue-800"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-800">
                            {product.name}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-400">
                            {product.sku} · {formatNumber(product.quantity)} unités
                          </p>
                        </div>
                        <p className="shrink-0 text-sm font-extrabold text-slate-800 sm:text-right">
                          {formatFCFA(value)}
                        </p>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-400"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Alertes de stock */}
        <section className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                <AlertTriangle size={19} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Alertes de stock
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Produits au seuil minimum ou en dessous.
                </p>
              </div>
            </div>
            <span
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                lowStock.length > 0
                  ? "bg-orange-50 text-orange-700"
                  : "bg-emerald-50 text-emerald-700"
              }`}
            >
              {formatNumber(lowStock.length)} alerte(s)
            </span>
          </div>

          {lowStock.length === 0 ? (
            <div className="flex flex-col items-center px-5 py-10 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <TrendingUp size={22} />
              </div>
              <p className="text-sm font-bold text-emerald-700">
                Aucun stock faible
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Tous les produits respectent leur seuil minimum.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {lowStock.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between gap-3 px-5 py-4 sm:px-6"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                      <Package size={17} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-800">
                        {product.name}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        Référence : {product.sku}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-extrabold text-orange-600">
                      {formatNumber(product.quantity)} unités
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Minimum : {formatNumber(product.minStock)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Historique récent */}
        <section className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <History size={19} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Historique récent
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Opérations de la période sélectionnée.
                </p>
              </div>
            </div>
            <Link
              href="/mouvements"
              className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-50"
            >
              Voir tout <ChevronRight size={14} />
            </Link>
          </div>

          {filteredMovements.length === 0 ? (
            <EmptyState
              icon={<History size={22} />}
              title="Aucun mouvement sur cette période"
              description="Les opérations de stock apparaîtront ici après leur enregistrement."
            />
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredMovements.slice(0, 10).map((movement) => {
                const isEntry = movement.type === "ENTREE";

                return (
                  <div
                    key={movement.id}
                    className="flex items-center justify-between gap-3 px-5 py-4 transition hover:bg-slate-50/70 sm:px-6"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                          isEntry
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-orange-50 text-orange-600"
                        }`}
                      >
                        {isEntry ? (
                          <ArrowDownToLine size={18} />
                        ) : (
                          <ArrowUpFromLine size={18} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-800">
                          {movement.productName}
                        </p>
                        <p className="mt-1 truncate text-xs text-slate-400">
                          {movement.reason} · {formatDate(movement.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={`text-sm font-extrabold ${
                          isEntry ? "text-emerald-600" : "text-orange-600"
                        }`}
                      >
                        {isEntry ? "+" : "−"}
                        {formatNumber(movement.quantity)}
                      </p>
                      <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        {isEntry ? "Entrée" : "Sortie"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <footer className="border-t border-slate-200 py-5 text-center text-[11px] text-slate-400">
          Nexora Inventory · Rapports & statistiques · Données stockées localement
        </footer>
      </div>
    </main>
  );
}

function StatCard({
  title,
  value,
  caption,
  icon,
  tone,
}: {
  title: string;
  value: string;
  caption: string;
  icon: React.ReactNode;
  tone: "blue" | "violet" | "green" | "orange";
}) {
  const tones = {
    blue: "bg-blue-50 text-blue-700",
    violet: "bg-violet-50 text-violet-700",
    green: "bg-emerald-50 text-emerald-700",
    orange: "bg-orange-50 text-orange-700",
  };

  return (
    <div className="rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-500">{title}</p>
          <p className="mt-2 break-words text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
            {value}
          </p>
          <p className="mt-1.5 text-[11px] text-slate-400">{caption}</p>
        </div>
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${tones[tone]}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

function ActivityCard({
  title,
  value,
  subtitle,
  icon,
  tone,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  tone: "green" | "orange" | "blue";
}) {
  const tones = {
    green: {
      icon: "bg-emerald-50 text-emerald-700",
      value: "text-emerald-600",
      line: "bg-emerald-500",
    },
    orange: {
      icon: "bg-orange-50 text-orange-700",
      value: "text-orange-600",
      line: "bg-orange-500",
    },
    blue: {
      icon: "bg-blue-50 text-blue-700",
      value: "text-blue-700",
      line: "bg-blue-500",
    },
  };

  return (
    <div className="relative overflow-hidden rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-500">{title}</p>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone].icon}`}>
          {icon}
        </div>
      </div>
      <p className={`mt-4 text-3xl font-extrabold tracking-tight ${tones[tone].value}`}>
        {value}
      </p>
      <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
      <div className={`absolute bottom-0 left-0 h-1 w-full ${tones[tone].line}`} />
    </div>
  );
}

function DistributionBar({
  title,
  amount,
  percentage,
  tone,
}: {
  title: string;
  amount: number;
  percentage: number;
  tone: "green" | "orange";
}) {
  const isGreen = tone === "green";

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-700">{title}</p>
          <p className="mt-0.5 text-xs text-slate-400">
            {formatNumber(amount)} unités
          </p>
        </div>
        <p
          className={`text-sm font-extrabold ${
            isGreen ? "text-emerald-600" : "text-orange-600"
          }`}
        >
          {percentage.toFixed(1)} %
        </p>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isGreen ? "bg-emerald-500" : "bg-orange-500"
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center px-5 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-slate-400">
        {icon}
      </div>
      <p className="text-sm font-bold text-slate-700">{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-5 text-slate-400">
        {description}
      </p>
    </div>
  );
}

function ArrowLeftRightIcon() {
  return (
    <span className="flex items-center">
      <ArrowDownRight size={15} />
      <ArrowUpRight size={15} />
    </span>
  );
}
