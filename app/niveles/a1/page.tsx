import { redirect } from "next/navigation";

// La antigua página intermedia de A1 solo tenía un botón hacia las islas: se va directo.
export default function A1Page() { redirect("/islas"); }
