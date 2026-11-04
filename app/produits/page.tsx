"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { FormEvent, ReactNode } from "react";
import { useDatabase } from "@/lib/database/DatabaseProvider";
import type { Product } from "@/lib/database/db";
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
        await db.products.add({
          ...productData,
          createdAt: now,
        });
      }

      setShowForm(false);
      setForm(emptyForm);
      setEditingId(null);
    } catch {
      setError("Impossible d'enregistrer ce produit.");
    }
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

          <button
            onClick={openAddForm}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-700/20 transition hover:-translate-y-0.5 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-200"
          >
            <Plus size={18} />
            Nouveau produit
          </button>
        </section>

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
