"use client";

import Image from "next/image";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AccountShell } from "@/components/accounts/AccountShell";
import styles from "@/components/accounts/accounts.module.css";
import { createProfile, getTeacherInvite, normalizeCode } from "@/features/accounts/account-service";
import { useAuth } from "@/features/accounts/AuthProvider";
import type { AccountRole } from "@/features/accounts/types";

const NOTE = "El tipo de cuenta no se puede cambiar después.";
const ROLES: { role: AccountRole; name: string; lead: string; gets: string[]; image: { src: string; width: number; height: number } }[] = [
  { role: "student", name: "Estudiante", lead: "Quiero aprender español y guardar mi progreso.", gets: ["Historias de nivel A1 organizadas por islas", "Palabras guardadas y tarjetas para repasarlas", "Unirte a tu profesor con su enlace o código"], image: { src: "/cuenta/estudiante.jpg", width: 1000, height: 605 } },
  { role: "teacher", name: "Profesor", lead: "Quiero invitar a mis estudiantes y seguir su progreso.", gets: ["Una invitación personal para cada estudiante", "La ficha de cada uno: historias, palabras y práctica", "Tareas de lectura, tarjetas y verbos"], image: { src: "/cuenta/profesor.jpg", width: 1000, height: 623 } },
];

function Onboarding(){const {user,profile,loading,refreshProfile}=useAuth();const router=useRouter();const params=useSearchParams();const next=params.get("next");const destination=next?.startsWith("/")&&!next.startsWith("//")?next:null;
  // Si llega desde una invitación (/join/CÓDIGO), solo puede crear una cuenta de estudiante.
  const inviteCode=destination?.match(/^\/join\/([^/?#]+)/)?.[1]??null;
  const [selected,setSelected]=useState<AccountRole|null>(inviteCode?"student":null);const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [teacherName,setTeacherName]=useState<string|null>(null);
  useEffect(()=>{if(!loading&&!user)router.replace(`/sign-in${destination?`?next=${encodeURIComponent(destination)}`:""}`);else if(profile)router.replace(destination??`/${profile.role}`)},[destination,loading,profile,router,user]);
  useEffect(()=>{if(!inviteCode)return;let cancelled=false;getTeacherInvite(inviteCode).then(invite=>{if(!cancelled)setTeacherName(invite?.active?invite.teacherName:null)}).catch(()=>{});return()=>{cancelled=true}},[inviteCode]);
  const displayName=user?.displayName?.trim()||user?.email?.split("@")[0]||"Usuario";
  const choose=async()=>{if(!user||!selected)return;setBusy(true);setError("");try{await createProfile({uid:user.uid,role:selected,displayName,email:user.email||""});await refreshProfile();router.replace(selected==="teacher"?"/teacher":destination??"/student")}catch(e){setError(e instanceof Error?e.message:"No pudimos guardar tu elección.");setBusy(false)}};
  if(loading||!user||profile)return <AccountShell><main className={styles.loading}>Preparando tu cuenta…</main></AccountShell>;
  return <AccountShell><main>
    <section className={styles.chooseHero}>
      <h1>¿Cómo usarás SpanStories?</h1>
      <p className={styles.chooseIntro}>{inviteCode?"Crea tu cuenta de estudiante para aceptar la invitación.":"Elige tu tipo de cuenta. Cada una empieza en un lugar distinto."}</p>
      {inviteCode?<p className={styles.invite}>{teacherName?<><b>{teacherName}</b> te invita </>:"Te han invitado "}<span>con el código <span className={styles.inviteCode}>{normalizeCode(inviteCode)}</span></span></p>:null}
    </section>
    <div className={styles.chooseWrap}>
      <fieldset className={styles.roles}>
        <legend>Tipo de cuenta</legend>
        {ROLES.map(item=>{const locked=item.role==="teacher"&&Boolean(inviteCode);return <label className={styles.role} key={item.role}>
          <input aria-describedby={`lead-${item.role}`} aria-labelledby={`name-${item.role}`} checked={selected===item.role} disabled={busy||locked} name="role" onChange={()=>{setSelected(item.role);setError("")}} type="radio" value={item.role}/>
          <span aria-hidden="true" className={styles.portrait}><Image alt="" height={item.image.height} sizes="(max-width: 720px) 100vw, 420px" src={item.image.src} width={item.image.width}/></span>
          <span className={styles.roleBody}>
            <span className={styles.roleHead}><span aria-hidden="true" className={styles.dot}/><span className={styles.roleName} id={`name-${item.role}`}>{item.name}</span></span>
            <span className={styles.roleLead} id={`lead-${item.role}`}>{item.lead}</span>
            <span className={styles.gets}>{item.gets.map(text=><span key={text}>{text}</span>)}</span>
            <span className={styles.start}>Empiezas en {item.role==="student"?<><b>Hola, {displayName}</b>, con tus profesores y el acceso a las historias.</>:<><b>Tus estudiantes</b>, listo para invitar al primero.</>}</span>
            {locked?<span className={styles.lockNote}>Para aceptar una invitación necesitas una cuenta de estudiante.</span>:null}
          </span>
        </label>})}
      </fieldset>
      <div className={styles.next}>
        <button className={styles.button} disabled={!selected||busy} onClick={()=>void choose()} type="button">{busy?"Creando cuenta…":"Continuar"}</button>
        <p aria-live="polite" className={styles.nextNote}>{NOTE}</p>
        {error?<p className={`${styles.message} ${styles.error}`} role="alert">{error}</p>:null}
      </div>
    </div>
  </main></AccountShell>}
export default function OnboardingPage(){return <Suspense><Onboarding/></Suspense>}
