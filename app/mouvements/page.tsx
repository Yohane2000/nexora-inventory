"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useDatabase } from "@/lib/database/DatabaseProvider";
import type { MovementType } from "@/lib/database/db";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  Plus,
  Search,
  Clock3,
  X,
  Save,
  Wifi,
  WifiOff,
  History,
  Package,
  CalendarDays,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
  RotateCcw,
  Boxes,
} from "lucide-react";

const formatDate = (date: string) => {
  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) return "Date indisponible";

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Brazzaville",
  }).format(parsedDate);
};

const formatNumber = (value: number) =>
  new Intl.NumberFormat("fr-FR").format(value);

export default function MovementsPage() {
  const db = useDatabase();

  const products = useLiveQuery(
    () => db.products.toArray(),
    [db],
    []
  );

  const movements = useLiveQuery(
    () => db.movements.orderBy("createdAt").reverse().toArray(),
    [db],
    []
  );

  const [isOnline, setIsOnline] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("TOUS");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    productId: "",
    type: "ENTREE" as MovementType,
    quantity: "",
    reason: "Approvisionnement",
    note: "",
  });

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

  const totalEntries = movements.filter((movement) => movement.type === "ENTREE").length;
  const totalExits = movements.filter((movement) => movement.type === "SORTIE").length;
  const entryUnits = movements
    .filter((movement) => movement.type === "ENTREE")
    .reduce((total, movement) => total + movement.quantity, 0);
  const exitUnits = movements
    .filter((movement) => movement.type === "SORTIE")
    .reduce((total, movement) => total + movement.quantity, 0);

  const filteredMovements = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return movements.filter((movement) => {
      const matchesSearch =
        !normalizedSearch ||
        movement.productName.toLowerCase().includes(normalizedSearch) ||
        movement.productSku.toLowerCase().includes(normalizedSearch) ||
        movement.reason.toLowerCase().includes(normalizedSearch) ||
        (movement.note || "").toLowerCase().includes(normalizedSearch);

      const matchesType = filter === "TOUS" || movement.type === filter;
      const movementDate = new Date(movement.createdAt);
      const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
      const to = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null;
      const matchesFrom = !from || movementDate >= from;
      const matchesTo = !to || movementDate <= to;

      return matchesSearch && matchesType && matchesFrom && matchesTo;
    });
  }, [movements, search, filter, dateFrom, dateTo]);

  function resetFilters() {
    setSearch("");
    setFilter("TOUS");
    setDateFrom("");
    setDateTo("");
  }

  function openForm() {
    setError("");
    setForm({
      productId: "",
      type: "ENTREE",
      quantity: "",
      reason: "Approvisionnement",
      note: "",
    });
    setShowForm(true);
  }

  function changeMovementType(type: MovementType) {
    setForm((current) => ({
      ...current,
      type,
      reason: type === "ENTREE" ? "Approvisionnement" : "Vente",
    }));
    setError("");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    setError("");

    const productId = Number(form.productId);
    const quantity = Number(form.quantity);

    if (!Number.isInteger(productId) || productId <= 0) {
      setError("Veuillez sélectionner un produit.");
      return;
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
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
            form.type === "ENTREE"
              ? previousStock + quantity
              : previousStock - quantity;

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
            type: form.type,
            quantity,
            previousStock,
            newStock,
            purchasePriceAtMovement: product.purchasePrice,
            salePriceAtMovement: product.salePrice,
            reason: form.reason,
            note: form.note.trim(),
            createdAt: now,
          });
        }
      );

      setShowForm(false);
      setForm({
        productId: "",
        type: "ENTREE",
        quantity: "",
        reason: "Approvisionnement",
        note: "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setSaving(false);
    }
  }

  const selectedProduct = products.find(
    (product) => String(product.id) === form.productId
  );

  return (
    <main className="min-h-screen bg-[#F4F7FC] pb-10">
      <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
        {/* En-tête */}
        <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-950 via-blue-950 to-blue-800 p-6 text-white shadow-xl shadow-blue-950/10 sm:p-8">
          <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full border-[36px] border-white/5" />
          <div className="pointer-events-none absolute -bottom-28 right-1/4 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-2xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-blue-100">
                <ArrowLeftRight size={14} />
                Opérations d'inventaire
              </div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Mouvements de stock
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-blue-100/80 sm:text-base">
                Gardez une vision claire des entrées, des sorties et de chaque
                variation de votre inventaire.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-blue-100/80">
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
                <span className="rounded-full bg-white/10 px-3 py-1.5">
                  {formatNumber(movements.length)} opération(s) enregistrée(s)
                </span>
              </div>
            </div>

            <button
              onClick={openForm}
              disabled={products.length === 0}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3.5 text-sm font-bold text-blue-950 shadow-lg shadow-black/10 transition hover:-translate-y-0.5 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={18} />
              Nouveau mouvement
            </button>
          </div>
        </section>

        {/* Indicateurs */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Total des opérations"
            value={formatNumber(movements.length)}
            caption="Mouvements enregistrés"
            icon={<History size={20} />}
            tone="blue"
          />
          <StatCard
            title="Entrées"
            value={formatNumber(totalEntries)}
            caption={`${formatNumber(entryUnits)} unités ajoutées`}
            icon={<TrendingUp size={20} />}
            tone="green"
          />
          <StatCard
            title="Sorties"
            value={formatNumber(totalExits)}
            caption={`${formatNumber(exitUnits)} unités retirées`}
            icon={<TrendingDown size={20} />}
            tone="orange"
          />
          <StatCard
            title="Variation nette"
            value={`${exitUnits > entryUnits ? "−" : "+"}${formatNumber(
              Math.abs(entryUnits - exitUnits)
            )}`}
            caption="Différence entre entrées et sorties"
            icon={<Boxes size={20} />}
            tone="violet"
          />
        </section>

        {/* Filtres */}
        <section className="rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/40 sm:p-5">
          <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <SlidersHorizontal size={17} className="text-blue-600" />
                Rechercher et filtrer
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Affinez l'historique par produit, type ou période.
              </p>
            </div>
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 self-start rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 sm:self-auto"
            >
              <RotateCcw size={13} />
              Réinitialiser
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="relative xl:col-span-2">
              <Search
                size={17}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="search"
                placeholder="Produit, référence, motif ou note..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-3 pl-10 pr-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
              />
            </div>

            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
            >
              <option value="TOUS">Tous les mouvements</option>
              <option value="ENTREE">Entrées uniquement</option>
              <option value="SORTIE">Sorties uniquement</option>
            </select>

            <div className="grid grid-cols-2 gap-2">
              <label className="min-w-0">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Du
                </span>
                <input
                  aria-label="Date de début"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 px-2 py-3 text-xs text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                />
              </label>
              <label className="min-w-0">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Au
                </span>
                <input
                  aria-label="Date de fin"
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 px-2 py-3 text-xs text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                />
              </label>
            </div>
          </div>
        </section>

        {/* Historique */}
        <section className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:px-6">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                  <History size={18} />
                </div>
                <h2 className="text-base font-bold text-slate-900">
                  Historique des opérations
                </h2>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {formatNumber(filteredMovements.length)} résultat(s)
                {filteredMovements.length !== movements.length
                  ? ` sur ${formatNumber(movements.length)}`
                  : ""}
              </p>
            </div>
            <div className="inline-flex items-center gap-2 self-start rounded-full bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500 sm:self-auto">
              <CalendarDays size={14} />
              Tri du plus récent au plus ancien
            </div>
          </div>

          {filteredMovements.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-5 py-16 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <History size={28} />
              </div>
              <h3 className="font-bold text-slate-800">
                Aucun mouvement trouvé
              </h3>
              <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
                {movements.length === 0
                  ? "Les entrées et sorties de stock apparaîtront ici dès votre première opération."
                  : "Aucune opération ne correspond à vos critères. Essayez de modifier les filtres."}
              </p>
              {movements.length > 0 && (
                <button
                  onClick={resetFilters}
                  className="mt-4 rounded-xl bg-blue-50 px-4 py-2.5 text-xs font-bold text-blue-700 transition hover:bg-blue-100"
                >
                  Effacer les filtres
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredMovements.map((movement) => {
                const isEntry = movement.type === "ENTREE";

                return (
                  <article
                    key={movement.id}
                    className="flex flex-col gap-4 px-5 py-5 transition hover:bg-slate-50/70 sm:flex-row sm:items-center sm:justify-between sm:px-6"
                  >
                    <div className="flex min-w-0 items-start gap-3.5">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                          isEntry
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-orange-50 text-orange-600"
                        }`}
                      >
                        {isEntry ? (
                          <ArrowDownToLine size={20} />
                        ) : (
                          <ArrowUpFromLine size={20} />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-sm font-bold text-slate-900">
                            {movement.productName}
                          </h3>
                          <span
                            className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                              isEntry
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-orange-50 text-orange-700"
                            }`}
                          >
                            {isEntry ? "Entrée" : "Sortie"}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          Réf. {movement.productSku}{" "}
                          <span className="px-1 text-slate-300">·</span>
                          {movement.reason}
                        </p>
                        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-slate-400">
                          <Clock3 size={12} />
                          {formatDate(movement.createdAt)}
                        </p>
                        {movement.note && (
                          <p className="mt-2 max-w-2xl rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
                            {movement.note}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-3 sm:min-w-[190px] sm:justify-end sm:border-0 sm:pt-0">
                      <div className="sm:text-right">
                        <p
                          className={`text-base font-extrabold tracking-tight ${
                            isEntry ? "text-emerald-600" : "text-orange-600"
                          }`}
                        >
                          {isEntry ? "+" : "−"}
                          {formatNumber(movement.quantity)} unités
                        </p>
                        <p className="mt-1 text-[11px] text-slate-400">
                          Stock : {formatNumber(movement.previousStock)} →{" "}
                          {formatNumber(movement.newStock)}
                        </p>
                      </div>
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                          isEntry
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-orange-50 text-orange-600"
                        }`}
                      >
                        {isEntry ? (
                          <TrendingUp size={17} />
                        ) : (
                          <TrendingDown size={17} />
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <p className="pb-2 text-center text-[11px] text-slate-400">
          Nexora Inventory · Historique stocké localement sur cet appareil
        </p>
      </div>

      {/* Formulaire de mouvement */}
      {showForm && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              setShowForm(false);
            }
          }}
        >
          <div className="max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-2xl sm:rounded-[28px] sm:p-7">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-700">
                  <ArrowLeftRight size={12} />
                  Opération de stock
                </div>
                <h2 className="text-xl font-bold tracking-tight text-slate-900">
                  Nouveau mouvement
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Enregistrez une entrée ou une sortie de marchandises.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                disabled={saving}
                aria-label="Fermer le formulaire"
                className="rounded-xl bg-slate-100 p-2.5 text-slate-500 transition hover:bg-slate-200 disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="mb-2 block text-xs font-bold text-slate-700">
                  Type d'opération
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => changeMovementType("ENTREE")}
                    className={`flex items-center justify-center gap-2 rounded-2xl border p-3.5 text-sm font-bold transition ${
                      form.type === "ENTREE"
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700 ring-4 ring-emerald-500/5"
                        : "border-slate-200 text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    <ArrowDownToLine size={18} />
                    Entrée
                  </button>
                  <button
                    type="button"
                    onClick={() => changeMovementType("SORTIE")}
                    className={`flex items-center justify-center gap-2 rounded-2xl border p-3.5 text-sm font-bold transition ${
                      form.type === "SORTIE"
                        ? "border-orange-300 bg-orange-50 text-orange-700 ring-4 ring-orange-500/5"
                        : "border-slate-200 text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    <ArrowUpFromLine size={18} />
                    Sortie
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold text-slate-700">
                  Produit *
                </label>
                <select
                  required
                  value={form.productId}
                  onChange={(e) =>
                    setForm({ ...form, productId: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                >
                  <option value="">Sélectionner un produit</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} — Stock : {formatNumber(product.quantity)}
                    </option>
                  ))}
                </select>
                {selectedProduct && (
                  <div className="mt-2 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    <Package size={14} />
                    Stock disponible :{" "}
                    <strong className="text-slate-800">
                      {formatNumber(selectedProduct.quantity)} unités
                    </strong>
                  </div>
                )}
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold text-slate-700">
                  Quantité *
                </label>
                <input
                  required
                  type="number"
                  min="1"
                  step="1"
                  value={form.quantity}
                  onChange={(e) =>
                    setForm({ ...form, quantity: e.target.value })
                  }
                  placeholder="Ex. : 10"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold text-slate-700">
                  Motif de l'opération *
                </label>
                <select
                  value={form.reason}
                  onChange={(e) =>
                    setForm({ ...form, reason: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                >
                  {form.type === "ENTREE" ? (
                    <>
                      <option>Approvisionnement</option>
                      <option>Retour client</option>
                      <option>Transfert entrant</option>
                      <option>Autre</option>
                    </>
                  ) : (
                    <>
                      <option>Vente</option>
                      <option>Produit endommagé</option>
                      <option>Transfert sortant</option>
                      <option>Perte</option>
                      <option>Autre</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold text-slate-700">
                  Note complémentaire
                </label>
                <textarea
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="Informations supplémentaires..."
                  rows={3}
                  className="w-full resize-none rounded-xl border border-slate-200 px-4 py-3.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                />
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs font-medium leading-5 text-red-700"
                >
                  {error}
                </div>
              )}

              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  disabled={saving}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-3.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving || products.length === 0}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-bold text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    form.type === "ENTREE"
                      ? "bg-emerald-600 shadow-emerald-600/15 hover:bg-emerald-700"
                      : "bg-orange-600 shadow-orange-600/15 hover:bg-orange-700"
                  }`}
                >
                  <Save size={17} />
                  {saving ? "Enregistrement..." : "Enregistrer le mouvement"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
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
  tone: "blue" | "green" | "orange" | "violet";
}) {
  const tones = {
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
    orange: "bg-orange-50 text-orange-700",
    violet: "bg-violet-50 text-violet-700",
  };

  return (
    <div className="rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900">
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
