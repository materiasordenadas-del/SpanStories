import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PageEditor } from "@/components/page-editor/PageEditor";
import "./globals.css";
import "./standalone-motion.css";

export const metadata: Metadata = {
  title: "SpanStories",
  description: "Aprende español mediante historias e islas de conocimiento.",
};

// El editor de maquetas es una herramienta de diseño: nunca llega a los estudiantes en producción.
const pageEditorEnabled = process.env.NODE_ENV === "development";

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es">
      <body>{pageEditorEnabled ? <PageEditor>{children}</PageEditor> : children}</body>
    </html>
  );
}
