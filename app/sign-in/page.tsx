"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithCredential, signInWithEmailAndPassword } from "firebase/auth";
import { useRouter, useSearchParams } from "next/navigation";
import { AccountShell } from "@/components/accounts/AccountShell";
import styles from "@/components/accounts/accounts.module.css";
import { getProfile } from "@/features/accounts/account-service";
import { auth } from "@/lib/firebase/client";

let activeGoogleCredential: ((credential: string) => void) | null = null;
let activeGoogleError: ((message: string) => void) | null = null;
let googleInitialized = false;

function friendlyError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code.includes("invalid-credential")) return "El email o la contraseña no son correctos.";
  if (code.includes("email-already-in-use")) return "Ese email ya tiene una cuenta. Inicia sesión.";
  if (code.includes("weak-password")) return "Usa una contraseña de al menos 6 caracteres.";
  if (code.includes("account-exists-with-different-credential")) return "Ese email ya usa otro método de acceso.";
  return error instanceof Error ? error.message : "No pudimos completar la operación.";
}

declare global {
  interface Window {
    google?: { accounts: { id: {
      initialize: (options: { client_id: string; callback: (response: { credential?: string }) => void }) => void;
      renderButton: (element: HTMLElement, options: { theme: string; size: string; width: number; text: string }) => void;
    } } };
  }
}

function GoogleButton({ busy, onCredential, onError }: { busy: boolean; onCredential: (credential: string) => void; onError: (message: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => { activeGoogleCredential = onCredential; activeGoogleError = onError; }, [onCredential, onError]);
  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) { activeGoogleError?.("Google todavía no está configurado."); return; }
    const render = () => {
      if (!window.google || !container.current) return;
      if (!googleInitialized) {
        window.google.accounts.id.initialize({ client_id: clientId, callback: (response) => response.credential ? activeGoogleCredential?.(response.credential) : activeGoogleError?.("Google no devolvió una credencial.") });
        googleInitialized = true;
      }
      container.current.replaceChildren();
      window.google.accounts.id.renderButton(container.current, { theme: "outline", size: "large", width: Math.min(380, container.current.clientWidth || 380), text: "continue_with" });
    };
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    if (window.google) render();
    else if (existing) existing.addEventListener("load", render, { once: true });
    else { const script = document.createElement("script"); script.src="https://accounts.google.com/gsi/client"; script.async=true; script.defer=true; script.onload=render; script.onerror=()=>activeGoogleError?.("No se pudo cargar el acceso de Google."); document.head.appendChild(script); }
    return () => existing?.removeEventListener("load", render);
  }, []);
  return <div aria-disabled={busy} ref={container} style={{minHeight:44,opacity:busy?.55:1,pointerEvents:busy?"none":"auto"}} />;
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
  const google = async (idToken: string) => { if (!auth) return setError("Firebase todavía no está configurado."); setBusy(true); setError(""); try { const result=await signInWithCredential(auth,GoogleAuthProvider.credential(idToken)); await finish(result.user.uid); } catch (err) { setError(friendlyError(err)); } finally { setBusy(false); } };
  return <AccountShell><main className={`${styles.main} ${styles.narrow}`}><h1 className={styles.title}>{creating ? "Crear cuenta" : "Iniciar sesión"}</h1><p className={styles.subtitle}>Entra con Google o con tu email. Solo te preguntaremos lo necesario.</p><section className={styles.card}><GoogleButton busy={busy} onCredential={(credential)=>void google(credential)} onError={setError}/><div className={styles.divider}>o</div><form className={styles.form} onSubmit={(event) => {event.preventDefault(); void submit();}}><label className={styles.field}>Email<input autoComplete="email" className={styles.input} onChange={(e)=>setEmail(e.target.value)} required type="email" value={email}/></label><label className={styles.field}>Contraseña<input autoComplete={creating?"new-password":"current-password"} className={styles.input} minLength={6} onChange={(e)=>setPassword(e.target.value)} required type="password" value={password}/></label><button className={styles.button} disabled={busy} type="submit">{busy?"Un momento…":creating?"Crear mi cuenta":"Entrar"}</button></form>{error?<p className={`${styles.message} ${styles.error}`} role="alert">{error}</p>:null}<p className={styles.switch}>{creating?"¿Ya tienes cuenta? ":"¿Aún no tienes cuenta? "}<button className={styles.link} onClick={()=>{setCreating(v=>!v);setError("");}} type="button">{creating?"Inicia sesión":"Créala aquí"}</button></p></section></main></AccountShell>;
}
export default function SignInPage(){return <Suspense><SignInForm/></Suspense>}
