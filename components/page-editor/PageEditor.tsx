"use client";

import { type DragEvent, type MouseEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import styles from "./page-editor.module.css";

// Una nueva referencia visual debe poder renderizarse aunque el navegador
// conserve una maqueta editada de una versión anterior. Al actualizar la
// navegación se conserva el resto de las ediciones guardadas por el usuario.
const storageKey = (pathname: string) => `spanstories.page-editor:v4:${pathname}`;

export function PageEditor({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const pageRef = useRef<HTMLDivElement>(null);
  const originalMarkup = useRef("");
  const draggedElement = useRef<HTMLElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;

    // La navegación de niveles debe reflejar siempre los enlaces actuales;
    // una maqueta guardada puede contener filas que ya no son navegables.
    const savedMarkup = pathname === "/niveles" ? null : window.localStorage.getItem(storageKey(pathname));
    const hasInteractiveStory = Boolean(page.querySelector("[data-interactive-story]"));
    if (savedMarkup && !hasInteractiveStory) {
      const currentNav = page.querySelector<HTMLElement>('nav[aria-label="Navegación principal"]');
      page.innerHTML = savedMarkup;
      const savedNav = page.querySelector<HTMLElement>('nav[aria-label="Navegación principal"]');
      if (currentNav && savedNav) savedNav.outerHTML = currentNav.outerHTML;
      window.localStorage.setItem(storageKey(pathname), page.innerHTML);
    }
    originalMarkup.current = page.innerHTML;
  }, [pathname]);

  useEffect(() => {
    const page = pageRef.current;
    if (!page || !editing) return;

    const movable = Array.from(page.querySelectorAll<HTMLElement>("section, article, footer, main > div"));
    movable.forEach((element) => {
      element.dataset.pageEditorMovable = "true";
      element.draggable = true;
    });

    return () => {
      movable.forEach((element) => {
        delete element.dataset.pageEditorMovable;
        element.draggable = false;
      });
      draggedElement.current = null;
    };
  }, [editing, pathname]);

  function startEditing() {
    if (!pageRef.current) return;
    originalMarkup.current = pageRef.current.innerHTML;
    setSaved(false);
    setEditing(true);
  }

  function save() {
    if (!pageRef.current) return;
    const cleanPage = pageRef.current.cloneNode(true) as HTMLDivElement;
    cleanPage.querySelectorAll<HTMLElement>("[data-page-editor-movable]").forEach((element) => {
      element.removeAttribute("data-page-editor-movable");
      element.removeAttribute("draggable");
    });
    window.localStorage.setItem(storageKey(pathname), cleanPage.innerHTML);
    originalMarkup.current = pageRef.current.innerHTML;
    setSaved(true);
  }

  function discard() {
    if (pageRef.current) pageRef.current.innerHTML = originalMarkup.current;
    setEditing(false);
    setSaved(false);
  }

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (!editing) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function handleDragStart(event: DragEvent<HTMLDivElement>) {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-page-editor-movable]");
    if (!target) return;
    draggedElement.current = target;
    event.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (editing) event.preventDefault();
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const destination = (event.target as HTMLElement).closest<HTMLElement>("[data-page-editor-movable]");
    const source = draggedElement.current;
    const parent = destination?.parentElement;
    if (!source || !destination || !parent || source === destination || source.parentElement !== parent) return;
    parent.insertBefore(source, destination);
  }

  return <>
    <div
      ref={pageRef}
      className={editing ? styles.editing : undefined}
      contentEditable={editing}
      suppressContentEditableWarning
      onClickCapture={handleClick}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >{children}</div>
    <aside className={styles.toolbar} aria-label="Controles de edición">
      {editing ? <>
        <span className={styles.label}>Modo edición</span>
        <button className={styles.save} type="button" onClick={save}>Guardar</button>
        <button className={styles.discard} type="button" onClick={discard}>Salir</button>
        {saved && <span className={styles.saved} role="status">Guardado</span>}
      </> : <button className={styles.gear} type="button" onClick={startEditing} aria-label="Activar modo edición" title="Editar esta página">⚙</button>}
    </aside>
  </>;
}
