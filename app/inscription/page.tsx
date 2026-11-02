"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  createUserWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";

import {
  doc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

import { auth, firestore } from "@/lib/firebase";

import {
  Boxes,
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

export default function InscriptionPage() {
  const router = useRouter();

  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setError("");
    setSuccess("");

    if (nom.trim().length < 2) {
      setError("Veuillez saisir votre nom complet.");
      return;
    }

    if (password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    try {
      setLoading(true);

      // Création du compte Firebase
      const credential = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      const user = credential.user;

      // Mise à jour du profil Firebase
      await updateProfile(user, {
        displayName: nom.trim(),
      });

      // Création de l'espace personnel dans Firestore
      await setDoc(doc(firestore, "users", user.uid), {
        uid: user.uid,
        displayName: nom.trim(),
        email: user.email,
        createdAt: serverTimestamp(),
      });

      setSuccess("Votre compte a été créé avec succès !");

      router.replace("/");
    } catch (err: unknown) {
      console.error("Erreur inscription :", err);

      const errorCode =
        typeof err === "object" &&
        err !== null &&
        "code" in err
          ? String(err.code)
          : "";

      switch (errorCode) {
        case "auth/email-already-in-use":
          setError("Cette adresse e-mail possède déjà un compte.");
          break;

        case "auth/invalid-email":
          setError("Veuillez saisir une adresse e-mail valide.");
          break;

        case "auth/weak-password":
          setError("Choisissez un mot de passe plus sécurisé.");
          break;

        case "auth/network-request-failed":
          setError("Connexion Internet nécessaire pour créer un compte.");
          break;

        case "permission-denied":
          setError("Impossible de créer votre espace personnel. Vérifiez les règles Firestore.");
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
              Bienvenue
            </p>

            <h2 className="mt-2 text-2xl font-extrabold text-slate-900">
              Créer un compte
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              Créez votre espace personnel pour commencer à gérer vos stocks.
            </p>

          </div>

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* NOM */}

            <div>

              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Nom complet
              </label>

              <div className="relative">

                <User
                  size={18}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                />

                <input
                  type="text"
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  placeholder="Ex : Jean Dupont"
                  autoComplete="name"
                  required
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3.5 pl-12 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-600/10"
                />

              </div>

            </div>

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

              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Mot de passe
              </label>

              <div className="relative">

                <Lock
                  size={18}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                />

                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="6 caractères minimum"
                  autoComplete="new-password"
                  required
                  minLength={6}
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

            {/* CONFIRMATION */}

            <div>

              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Confirmer le mot de passe
              </label>

              <div className="relative">

                <Lock
                  size={18}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                />

                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Répétez votre mot de passe"
                  autoComplete="new-password"
                  required
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3.5 pl-12 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-600/10"
                />

              </div>

            </div>

            {/* MESSAGE ERREUR */}

            {error && (

              <div className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">

                <AlertCircle size={18} className="mt-0.5 shrink-0" />

                <p>{error}</p>

              </div>

            )}

            {/* MESSAGE SUCCÈS */}

            {success && (

              <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-700">

                <CheckCircle2 size={18} />

                <p>{success}</p>

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
                  Création du compte...
                </>
              ) : (
                <>
                  Créer mon compte
                  <ArrowRight size={18} />
                </>
              )}

            </button>

          </form>

          {/* CONNEXION */}

          <div className="mt-7 border-t border-slate-100 pt-6 text-center">

            <p className="text-sm text-slate-500">
              Vous avez déjà un compte ?
            </p>

            <Link
              href="/connexion"
              className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-blue-700 hover:text-blue-800"
            >
              Se connecter
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