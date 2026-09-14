import { redirect } from "next/navigation";

// Las islas viven ahora dentro de Niveles; cada isla sigue en /islas/NN.
export default function IslandsPage() { redirect("/niveles"); }
