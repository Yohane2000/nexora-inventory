"use client";

import { useEffect, useState } from "react";
import { useDatabase } from "@/lib/database/DatabaseProvider";
import type { Product, Movement } from "@/lib/database/db";

interface DiagnosticResult {
  productId: number;
  name: string;
  currentStock: number;
  initialStock: number;
  entries: number;
  exits: number;
  theoreticalStock: number;
  difference: number;
  status: "OK" | "ANOMALIE";
  message: string;
}

export default function DiagnosticStockPage() {
const db = useDatabase();

  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function runDiagnostic() {
      try {
        setLoading(true);
        setError("");

        const [products, movements] = await Promise.all([
          db.products.toArray(),
          db.movements.toArray(),
        ]);

        const diagnostics = products.map((product: Product) => {
          const productMovements = movements.filter(
            (movement: Movement) =>
              movement.productId === product.id
          );

          const entries = productMovements
            .filter((movement) => movement.type === "ENTREE")
            .reduce((total, movement) => total + movement.quantity, 0);

          const exits = productMovements
            .filter((movement) => movement.type === "SORTIE")
            .reduce((total, movement) => total + movement.quantity, 0);

          const theoreticalStock =
            product.initialQuantity + entries - exits;

          const difference =
            product.quantity - theoreticalStock;

          const invalidValues =
            !Number.isFinite(product.quantity) ||
            !Number.isFinite(product.initialQuantity) ||
            !Number.isFinite(entries) ||
            !Number.isFinite(exits);

          const negativeInitial = product.initialQuantity < 0;

          const inconsistentStock = difference !== 0;

            const status: "OK" | "ANOMALIE" =
            invalidValues || negativeInitial || inconsistentStock
                ? "ANOMALIE"
                : "OK";

          let message = "Stock cohérent";

          if (invalidValues) {
            message = "Valeur numérique invalide";
          } else if (negativeInitial) {
            message = "Stock initial négatif";
          } else if (inconsistentStock) {
            message = "Écart entre stock actuel et stock théorique";
          }

          return {
            productId: product.id!,
            name: product.name,
            currentStock: product.quantity,
            initialStock: product.initialQuantity,
            entries,
            exits,
            theoreticalStock,
            difference,
            status,
            message,
          };
        });

        if (!cancelled) {
          setResults(diagnostics);
        }
      } catch (err) {
        console.error(err);

        if (!cancelled) {
          setError("Impossible de lire les données de la base locale.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    runDiagnostic();

    return () => {
      cancelled = true;
    };
  }, [db]);

  const anomalies = results.filter(
    (result) => result.status === "ANOMALIE"
  );

  if (loading) {
    return (
      <main className="p-6">
        <p>Analyse des stocks en cours...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="p-6">
        <p className="text-red-600">{error}</p>
      </main>
    );
  }

  return (
    <main className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">
          Diagnostic du stock
        </h1>

        <p className="mt-2 text-sm text-gray-500">
          Vérification des stocks et de l'historique des mouvements.
          Cette page ne modifie aucune donnée.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border p-4">
          <p className="text-sm text-gray-500">Produits analysés</p>
          <p className="text-2xl font-bold">{results.length}</p>
        </div>

        <div className="rounded-xl border p-4">
          <p className="text-sm text-gray-500">Produits cohérents</p>
          <p className="text-2xl font-bold text-green-600">
            {results.length - anomalies.length}
          </p>
        </div>

        <div className="rounded-xl border p-4">
          <p className="text-sm text-gray-500">Anomalies détectées</p>
          <p className="text-2xl font-bold text-red-600">
            {anomalies.length}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="bg-gray-100 text-left">
            <tr>
              <th className="p-3">Produit</th>
              <th className="p-3">Stock initial</th>
              <th className="p-3">Entrées</th>
              <th className="p-3">Sorties</th>
              <th className="p-3">Stock théorique</th>
              <th className="p-3">Stock actuel</th>
              <th className="p-3">Écart</th>
              <th className="p-3">Diagnostic</th>
            </tr>
          </thead>

          <tbody>
            {results.map((result) => (
              <tr key={result.productId} className="border-t">
                <td className="p-3 font-medium">{result.name}</td>
                <td className="p-3">{result.initialStock}</td>
                <td className="p-3">{result.entries}</td>
                <td className="p-3">{result.exits}</td>
                <td className="p-3">{result.theoreticalStock}</td>
                <td className="p-3">{result.currentStock}</td>
                <td className="p-3">{result.difference}</td>
                <td className="p-3">
                  <span
                    className={
                      result.status === "OK"
                        ? "font-semibold text-green-600"
                        : "font-semibold text-red-600"
                    }
                  >
                    {result.message}
                  </span>
                </td>
              </tr>
            ))}

            {results.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-gray-500">
                  Aucun produit enregistré.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}