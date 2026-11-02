"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";

import {
  Boxes,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
  AlertCircle,
} from "lucide-react";

export default function ConnexionPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setError("");

    try {
      setLoading(true);

      await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      router.replace("/");
    } catch (err: unknown) {
      console.error("Erreur connexion :", err);

      const errorCode =
        typeof err === "object" &&
        err !== null &&
        "code" in err
          ? String(err.code)
          : "";

      switch (errorCode) {
        case "auth/invalid-credential":
        case "auth/wrong-password":
        case "auth/user-not-found":
          setError("Adresse e-mail ou mot de passe incorrect.");
          break;

        case "auth/invalid-email":
          setError("Veuillez saisir une adresse e-mail valide.");
          break;

        case "auth/user-disabled":
          setError("Ce compte a été désactivé.");
          break;

        case "auth/too-many-requests":
          setError("Trop de tentatives. Réessayez plus tard.");
          break;

        case "auth/network-request-failed":
          setError("Impossible de se connecter. Vérifiez votre connexion Internet.");
          break;

        default:
          setError("Une erreur est survenue. Veuillez réessayer.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F5F7FB] px-4 py-10">

      <div className="w-full max-w-md">

        {/* LOGO */}

        <div className="mb-8 text-center">

          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-700 text-white shadow-xl shadow-blue-700/20">
            <Boxes size={32} />
          </div>

          <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-slate-900">
            Nexora Inventory
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Gérez votre stock, simplement.
          </p>

        </div>

        {/* FORMULAIRE */}

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/50 sm:p-8">

          <div className="mb-7">

            <p className="text-xs font-bold uppercase tracking-widest text-blue-700">
              Heureux de vous revoir
            </p>

            <h2 className="mt-2 text-2xl font-extrabold text-slate-900">
              Connexion
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              Connectez-vous pour retrouver votre espace personnel.
            </p>

          </div>

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* EMAIL */}

            <div>

              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Adresse e-mail
              </label>

              <div className="relative">

                <Mail
                  size={18}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                />

                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@exemple.com"
                  autoComplete="email"
                  required
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3.5 pl-12 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-600/10"
                />

              </div>

            </div>

            {/* MOT DE PASSE */}

            <div>

              <div className="mb-2 flex items-center justify-between">

                <label className="text-sm font-semibold text-slate-700">
                  Mot de passe
                </label>

                <Link
                  href="/mot-de-passe-oublie"
                  className="text-xs font-semibold text-blue-700 hover:text-blue-800"
                >
                  Mot de passe oublié ?
                </Link>

              </div>

              <div className="relative">

                <Lock
                  size={18}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                />

                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Votre mot de passe"
                  autoComplete="current-password"
                  required
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3.5 pl-12 pr-12 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-600/10"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>

              </div>

            </div>

            {/* ERREUR */}

            {error && (

              <div className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">

                <AlertCircle size={18} className="mt-0.5 shrink-0" />

                <p>{error}</p>

              </div>

            )}

            {/* BOUTON */}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-4 text-sm font-bold text-white shadow-lg shadow-blue-700/20 transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            >

              {loading ? (
                <>
                  <Loader2 size={19} className="animate-spin" />
                  Connexion...
                </>
              ) : (
                <>
                  Se connecter
                  <ArrowRight size={18} />
                </>
              )}

            </button>

          </form>

          {/* INSCRIPTION */}

          <div className="mt-7 border-t border-slate-100 pt-6 text-center">

            <p className="text-sm text-slate-500">
              Vous n'avez pas encore de compte ?
            </p>

            <Link
              href="/inscription"
              className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-blue-700 hover:text-blue-800"
            >
              Créer un compte
              <ArrowRight size={15} />
            </Link>

          </div>

        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          © 2026 Nexora Inventory. Tous droits réservés.
        </p>

      </div>

    </main>
  );
}