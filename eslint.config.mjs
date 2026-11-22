import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", ".next-studio-check/**", "out/**", "dist/**", "**/dist/**", "**/vendor/**", "**/node_modules/**", "functions/lib/**", "next-env.d.ts", "worlds/prototypes/**", "worlds/source-archive/**", "Escenarios/**", "reports/**", "**/exportaciones/**", "**/public/draco/**"]),
  // Motor three.js y talleres: JavaScript sin React; `MeshoptDecoder.useWorkers` no es un hook.
  { files: ["SpanStories-Ciudades/**", "Estudio/Talleres/**", "Generador-Mundos/**"], rules: { "react-hooks/rules-of-hooks": "off", "@next/next/no-assign-module-variable": "off" } },
]);
