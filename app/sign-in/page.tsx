"use client";

import { Suspense, useState } from "react";
import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { useRouter, useSearchParams } from "next/navigation";
import { AccountShell } from "@/components/accounts/AccountShell";
import styles from "@/components/accounts/accounts.module.css";
import { getProfile } from "@/features/accounts/account-service";
import { auth } from "@/lib/firebase/client";

function friendlyError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code.includes("invalid-credential")) return "El email o la contraseña no son correctos.";
  if (code.includes("email-already-in-use")) return "Ese email ya tiene una cuenta. Inicia sesión.";
  if (code.includes("weak-password")) return "Usa una contraseña de al menos 6 caracteres.";
  if (code.includes("account-exists-with-different-credential")) return "Ese email ya usa otro método de acceso.";
  if (code.includes("popup-blocked")) return "Tu navegador bloqueó la ventana de Google. Permite ventanas emergentes para este sitio e inténtalo de nuevo.";
  if (code.includes("popup-closed-by-user")) return "Cerraste la ventana de Google antes de terminar. Inténtalo de nuevo.";
  if (code.includes("unauthorized-domain")) return "Este sitio todavía no está autorizado para iniciar sesión con Google.";
  return error instanceof Error ? error.message : "No pudimos completar la operación.";
}

function SignInForm() {
  const router = useRouter(); const params = useSearchParams();
  const [creating, setCreating] = useState(params.get("mode") === "sign-up");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const next = params.get("next");
  const destination = (next?.startsWith("/") && !next.startsWith("//")) ? next : null;
  const finish = async (uid: string) => { const profile = await getProfile(uid); router.replace(profile ? (destination ?? `/${profile.role}`) : `/onboarding${destination ? `?next=${encodeURIComponent(destination)}` : ""}`); };
  const submit = async () => { if (!auth) return setError("Firebase todavía no está configurado."); setBusy(true); setError(""); try { const result = creating ? await createUserWithEmailAndPassword(auth,email,password) : await signInWithEmailAndPassword(auth,email,password); await finish(result.user.uid); } catch (err) { setError(friendlyError(err)); } finally { setBusy(false); } };
  // signInWithPopup abre la ventana directamente en el manejador de clic (gesto real del usuario), a diferencia
  // del botón crudo de Google Identity Services, que la abre desde dentro de su propio iframe y por eso los
  // navegadores modernos la bloquean cada vez con más frecuencia.
  const google = async () => {
    if (!auth) return setError("Firebase todavía no está configurado.");
    setBusy(true); setError("");
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      await finish(result.user.uid);
    } catch (err) {
      const code = typeof err === "object" && err && "code" in err ? String(err.code) : "";
      if (code !== "auth/cancelled-popup-request") setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };
  return <AccountShell><main className={`${styles.main} ${styles.narrow}`}><h1 className={styles.title}>{creating ? "Crear cuenta" : "Iniciar sesión"}</h1><p className={styles.subtitle}>Entra con Google o con tu email. Solo te preguntaremos lo necesario.</p><section className={styles.card}><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={() => void google()} type="button">{busy ? "Un momento…" : "Continuar con Google"}</button><div className={styles.divider}>o</div><form className={styles.form} onSubmit={(event) => {event.preventDefault(); void submit();}}><label className={styles.field}>Email<input autoComplete="email" className={styles.input} onChange={(e)=>setEmail(e.target.value)} required type="email" value={email}/></label><label className={styles.field}>Contraseña<input autoComplete={creating?"new-password":"current-password"} className={styles.input} minLength={6} onChange={(e)=>setPassword(e.target.value)} required type="password" value={password}/></label><button className={styles.button} disabled={busy} type="submit">{busy?"Un momento…":creating?"Crear mi cuenta":"Entrar"}</button></form>{error?<p className={`${styles.message} ${styles.error}`} role="alert">{error}</p>:null}<p className={styles.switch}>{creating?"¿Ya tienes cuenta? ":"¿Aún no tienes cuenta? "}<button className={styles.link} onClick={()=>{setCreating(v=>!v);setError("");}} type="button">{creating?"Inicia sesión":"Créala aquí"}</button></p></section></main></AccountShell>;
}
export default function SignInPage(){return <Suspense><SignInForm/></Suspense>}
