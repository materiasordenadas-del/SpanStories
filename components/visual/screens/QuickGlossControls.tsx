import { useEffect, useRef, useState } from "react";
import styles from "./baseline.module.css";

export type QuickGlossColor = "naranja" | "azul";

export const QUICK_GLOSS_COLORS: readonly { readonly id: QuickGlossColor; readonly label: string; readonly swatch: string }[] = [
  { id: "naranja", label: "Naranja", swatch: "#b84a18" },
  { id: "azul", label: "Azul", swatch: "#2f5596" },
];

function GearIcon() {
  return <svg aria-hidden="true" fill="none" height="19" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="19"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
}

/** Interruptor de traducción rápida y tuerquita de color, al final de la línea de ayuda del lector. */
export function QuickGlossControls({ enabled, hasGlosses, color, onToggle, onClear, onColorChange }: {
  enabled: boolean;
  hasGlosses: boolean;
  color: QuickGlossColor;
  onToggle: () => void;
  onClear: () => void;
  onColorChange: (color: QuickGlossColor) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const switchRef = useRef<HTMLButtonElement>(null);
  const gearRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !gearRef.current?.contains(target)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Esc cierra primero el menú; no retira las traducciones.
      event.stopPropagation();
      setMenuOpen(false);
      gearRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [menuOpen]);

  return <div className={styles.glossTools}>
    {enabled && hasGlosses ? <button className={styles.glossClear} onClick={() => { onClear(); switchRef.current?.focus(); }} type="button">Quitar traducciones</button> : null}
    <button aria-checked={enabled} className={styles.glossSwitch} onClick={onToggle} ref={switchRef} role="switch" type="button"><span aria-hidden="true" className={styles.glossTrack} />Traducción rápida</button>
    <button
      aria-controls={menuOpen ? "quick-gloss-color" : undefined}
      aria-expanded={menuOpen}
      aria-label="Ajustes de la traducción rápida"
      className={styles.glossGear}
      onClick={() => setMenuOpen((open) => !open)}
      ref={gearRef}
      type="button"
    ><GearIcon /></button>
    {menuOpen ? <div className={styles.glossColorMenu} id="quick-gloss-color" ref={menuRef}>
      <p id="quick-gloss-color-label">Color de la traducción</p>
      <div aria-labelledby="quick-gloss-color-label" className={styles.glossSwatches} role="radiogroup">
        {QUICK_GLOSS_COLORS.map((option, index) => <button
          aria-checked={color === option.id}
          className={styles.glossSwatch}
          key={option.id}
          onClick={() => onColorChange(option.id)}
          onKeyDown={(event) => {
            const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
            if (step === 0) return;
            event.preventDefault();
            const nextIndex = (index + step + QUICK_GLOSS_COLORS.length) % QUICK_GLOSS_COLORS.length;
            onColorChange(QUICK_GLOSS_COLORS[nextIndex].id);
            (event.currentTarget.parentElement?.children[nextIndex] as HTMLElement | undefined)?.focus();
          }}
          role="radio"
          tabIndex={color === option.id ? 0 : -1}
          type="button"
        >
          <span className={styles.glossSample} style={{ background: option.swatch }}>good</span>
          {option.label}
          <svg aria-hidden="true" className={styles.glossCheck} height="16" viewBox="0 0 24 24" width="16"><path d="M5 12.5l4.5 4.5L19 7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" /></svg>
        </button>)}
      </div>
    </div> : null}
  </div>;
}
