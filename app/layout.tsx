import type { Metadata } from "next";
import { Literata } from "next/font/google";
import type { ReactNode } from "react";
import { PageEditor } from "@/components/page-editor/PageEditor";
import "./globals.css";
import "./standalone-motion.css";

export const metadata: Metadata = {
  title: "SpanStories",
  description: "Aprende español mediante historias e islas de conocimiento.",
};

// Letra de lectura de las historias. Sin precarga: el navegador solo la descarga donde se usa (el lector).
const literata = Literata({ subsets: ["latin"], axes: ["opsz"], display: "swap", preload: false, variable: "--font-literata" });

// El editor de maquetas es una herramienta de diseño: nunca llega a los estudiantes en producción.
const pageEditorEnabled = process.env.NODE_ENV === "development";

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es" className={literata.variable}>
      <body>{pageEditorEnabled ? <PageEditor>{children}</PageEditor> : children}</body>
    </html>
  );
}
