import { redirect } from "next/navigation";

// La antigua página intermedia de A1 solo tenía un botón hacia las islas, que ahora están en Niveles.
export default function A1Page() { redirect("/niveles"); }
