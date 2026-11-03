"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import {
  getUserDatabase,
  type NexoraDatabase,
} from "@/lib/database/db";

type DatabaseContextType = {
  db: NexoraDatabase;
  uid: string;
};

const DatabaseContext = createContext<DatabaseContextType | null>(null);

export function DatabaseProvider({
  uid,
  children,
}: {
  uid: string;
  children: ReactNode;
}) {
  const [database, setDatabase] = useState<DatabaseContextType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setDatabase(null);
    setError(null);

    const userDatabase = getUserDatabase(uid);

    userDatabase
      .open()
      .then(() => {
        if (!cancelled) {
          setDatabase({
            db: userDatabase,
            uid,
          });
        }
      })
      .catch((err) => {
        console.error("Erreur ouverture base utilisateur :", err);

        if (!cancelled) {
          setError("Impossible d'ouvrir votre espace de stockage local.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [uid]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <p className="text-center text-sm font-medium text-red-600">
          {error}
        </p>
      </div>
    );
  }

  if (!database || database.uid !== uid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F7FB]">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-blue-700 border-t-transparent" />

          <p className="mt-4 text-sm font-medium text-slate-500">
            Préparation de votre inventaire...
          </p>
        </div>
      </div>
    );
  }

  return (
    <DatabaseContext.Provider value={database}>
      {children}
    </DatabaseContext.Provider>
  );
}

export function useDatabase() {
  const context = useContext(DatabaseContext);

  if (!context) {
    throw new Error(
      "useDatabase doit être utilisé à l'intérieur de DatabaseProvider."
    );
  }

  return context.db;
}

export function useDatabaseUid() {
  const context = useContext(DatabaseContext);

  if (!context) {
    throw new Error(
      "useDatabaseUid doit être utilisé à l'intérieur de DatabaseProvider."
    );
  }

  return context.uid;
}