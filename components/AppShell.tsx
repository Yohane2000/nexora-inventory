"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import {
  LayoutDashboard,
  Package,
  ArrowLeftRight,
  BarChart3,
  Settings,
  Wifi,
  WifiOff,
  Boxes,
  LogOut,
  UserRound,
} from "lucide-react";

import {
  onAuthStateChanged,
  signOut,
  type User,
} from "firebase/auth";

import { auth } from "@/lib/firebase";
import {
  DatabaseProvider,
  useDatabase,
  useDatabaseUid,
} from "@/lib/database/DatabaseProvider";

import { syncUserData } from "@/lib/sync/sync-engine";

const navigation = [
  {
    label: "Tableau de bord",
    shortLabel: "Accueil",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    label: "Produits",
    shortLabel: "Produits",
    href: "/produits",
    icon: Package,
  },
  {
    label: "Mouvements",
    shortLabel: "Stock",
    href: "/mouvements",
    icon: ArrowLeftRight,
  },
  {
    label: "Rapports",
    shortLabel: "Rapports",
    href: "/rapports",
    icon: BarChart3,
  },
  {
    label: "Paramètres",
    shortLabel: "Réglages",
    href: "/parametres",
    icon: Settings,
  },
];

const pageTitles: Record<string, string> = {
  "/": "Tableau de bord",
  "/produits": "Gestion des produits",
  "/mouvements": "Mouvements de stock",
  "/rapports": "Rapports et statistiques",
  "/parametres": "Paramètres",
};

const publicRoutes = [
  "/connexion",
  "/inscription",
  "/mot-de-passe-oublie",
];

function SyncManager() {
  const db = useDatabase();
  const uid = useDatabaseUid();

  useEffect(() => {
    let active = true;
    let syncing = false;

    const synchronize = async () => {
      if (!active || !navigator.onLine || syncing) return;

      syncing = true;

      try {
        await syncUserData(uid, db);

        if (active) {
          console.info("[Nexora Sync] Synchronisation des produits terminée.");
        }
      } catch (error) {
        if (active) {
          console.error("[Nexora Sync] Erreur de synchronisation :", error);
        }
      } finally {
        syncing = false;
      }
    };

    void synchronize();

    const handleOnline = () => {
      void synchronize();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void synchronize();
      }
    };

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);

    const intervalId = window.setInterval(() => {
      void synchronize();
    }, 30000);

    return () => {
      active = false;
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.clearInterval(intervalId);
    };
  }, [uid, db]);

  return null;
}

export default function AppShell({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const [isOnline, setIsOnline] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  const isPublicRoute = publicRoutes.includes(pathname);

  // --------------------------------------------------
  // ÉTAT DE LA CONNEXION INTERNET
  // --------------------------------------------------

  useEffect(() => {
    const updateStatus = () => {
      setIsOnline(navigator.onLine);
    };

    updateStatus();

    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);

    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, []);

  // --------------------------------------------------
  // AUTHENTIFICATION FIREBASE
  // --------------------------------------------------

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        setUser(currentUser);
        setAuthLoading(false);
      },
      (error) => {
        console.error(
          "Erreur authentification Firebase :",
          error
        );

        setUser(null);
        setAuthLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // --------------------------------------------------
  // PROTECTION DES ROUTES
  // --------------------------------------------------

  useEffect(() => {
    if (authLoading) return;

    if (!user && !isPublicRoute) {
      router.replace("/connexion");
      return;
    }

    if (user && isPublicRoute) {
      router.replace("/");
    }
  }, [user, authLoading, isPublicRoute, router]);

  // --------------------------------------------------
  // DÉCONNEXION
  // --------------------------------------------------

  const handleLogout = async () => {
    if (loggingOut) return;

    try {
      setLoggingOut(true);

      await signOut(auth);

      router.replace("/connexion");
    } catch (error) {
      console.error(
        "Erreur lors de la déconnexion :",
        error
      );

      setLoggingOut(false);
    }
  };

  // --------------------------------------------------
  // PAGES PUBLIQUES
  // --------------------------------------------------

  if (isPublicRoute) {
    return <>{children}</>;
  }

  // --------------------------------------------------
  // CHARGEMENT DE LA SESSION
  // --------------------------------------------------

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F7FB]">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-blue-700 border-t-transparent" />

          <p className="mt-4 text-sm font-medium text-slate-500">
            Chargement de votre espace Nexora...
          </p>
        </div>
      </div>
    );
  }

  // --------------------------------------------------
  // INFORMATIONS UTILISATEUR
  // --------------------------------------------------

  const currentTitle =
    pageTitles[pathname] || "Nexora Inventory";

  const displayName =
    user.displayName ||
    user.email?.split("@")[0] ||
    "Utilisateur";

  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

  // --------------------------------------------------
  // APPLICATION PRIVÉE
  // --------------------------------------------------

  return (
    <DatabaseProvider uid={user.uid}>
      <SyncManager />

      <div className="min-h-screen bg-[#F5F7FB]">

        {/* ==========================================
            SIDEBAR DESKTOP
        ========================================== */}

        <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">

          {/* LOGO */}

          <Link
            href="/"
            className="flex h-20 items-center gap-3 border-b border-slate-100 px-6"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-700 text-white shadow-lg shadow-blue-700/20">
              <Boxes size={24} />
            </div>

            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-slate-900">
                Nexora
              </h1>

              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Inventory
              </p>
            </div>
          </Link>

          {/* NAVIGATION */}

          <div className="flex-1 px-4 py-7">
            <p className="mb-4 px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
              Espace de gestion
            </p>

            <nav className="space-y-1.5">
              {navigation.map((item) => {
                const Icon = item.icon;

                const isActive =
                  pathname === item.href ||
                  (item.href !== "/" &&
                    pathname.startsWith(`${item.href}/`));

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                      isActive
                        ? "bg-blue-700 text-white shadow-lg shadow-blue-700/20"
                        : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <Icon size={19} />

                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* STATUT DE CONNEXION */}

          <div className="border-t border-slate-100 p-4">
            <div className="rounded-xl bg-slate-50 p-4">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${
                    isOnline
                      ? "bg-emerald-500"
                      : "bg-orange-500"
                  }`}
                />

                <span className="text-xs font-semibold text-slate-700">
                  {isOnline
                    ? "Application en ligne"
                    : "Mode hors ligne"}
                </span>
              </div>

              <p className="mt-2 text-[11px] leading-5 text-slate-400">
                Vos données sont enregistrées localement
                sur cet appareil.
              </p>
            </div>
          </div>

          {/* PROFIL UTILISATEUR */}

          <div className="border-t border-slate-100 p-4">
            <div className="flex items-center gap-3">

              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                {initials || <UserRound size={18} />}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-800">
                  {displayName}
                </p>

                <p className="truncate text-[11px] text-slate-400">
                  {user.email}
                </p>
              </div>

              <button
                onClick={handleLogout}
                disabled={loggingOut}
                title="Déconnexion"
                aria-label="Se déconnecter"
                className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              >
                <LogOut size={18} />
              </button>

            </div>
          </div>
        </aside>

        {/* ==========================================
            ZONE PRINCIPALE
        ========================================== */}

        <div className="lg:ml-64">

          {/* BARRE SUPÉRIEURE */}

          <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur-md sm:px-8">

            <div className="flex min-w-0 items-center gap-3">

              <Link
                href="/"
                className="flex shrink-0 items-center gap-2.5"
                aria-label="Retour au tableau de bord Nexora"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-700 text-white shadow-md shadow-blue-700/20">
                  <Boxes size={20} />
                </div>

                <div className="hidden sm:block">
                  <p className="text-sm font-extrabold tracking-tight text-slate-900">
                    Nexora
                  </p>

                  <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                    Inventory
                  </p>
                </div>
              </Link>

              <div className="mx-1 hidden h-8 w-px bg-slate-200 sm:block" />

              <div className="min-w-0">
                <h2 className="truncate text-sm font-bold text-slate-900 sm:text-base">
                  {currentTitle}
                </h2>
              </div>

            </div>

            {/* STATUT ET PROFIL */}

            <div className="flex shrink-0 items-center gap-3">

              <div
                className={`flex items-center gap-2 rounded-full px-3 py-2 text-[11px] font-semibold ${
                  isOnline
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-orange-50 text-orange-700"
                }`}
              >
                {isOnline ? (
                  <Wifi size={14} />
                ) : (
                  <WifiOff size={14} />
                )}

                <span className="hidden sm:inline">
                  {isOnline ? "En ligne" : "Hors ligne"}
                </span>
              </div>

              <div
                className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700"
                title={user.email || displayName}
              >
                {initials || <UserRound size={16} />}
              </div>

              <button
                onClick={handleLogout}
                disabled={loggingOut}
                title="Déconnexion"
                aria-label="Se déconnecter"
                className="rounded-lg p-2 text-slate-500 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 lg:hidden"
              >
                <LogOut size={19} />
              </button>

            </div>
          </header>

          {/* CONTENU DES PAGES */}

          <main className="min-h-[calc(100vh-4rem)] pb-24 lg:pb-8">
            {children}
          </main>

        </div>

        {/* ==========================================
            NAVIGATION MOBILE
        ========================================== */}

        <nav className="fixed bottom-0 left-0 right-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] pt-2 backdrop-blur-md lg:hidden">

          {navigation.map((item) => {
            const Icon = item.icon;

            const isActive =
              pathname === item.href ||
              (item.href !== "/" &&
                pathname.startsWith(`${item.href}/`));

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
                className={`flex flex-col items-center justify-center gap-1 py-2 text-[9px] font-semibold transition sm:text-[10px] ${
                  isActive
                    ? "text-blue-700"
                    : "text-slate-400 hover:text-slate-700"
                }`}
              >
                <Icon size={20} />

                <span>{item.shortLabel}</span>
              </Link>
            );
          })}

        </nav>

      </div>
    </DatabaseProvider>
  );
}