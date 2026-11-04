import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite recuperar el arranque cuando Windows bloquea la caché persistente de desarrollo.
  ...(process.env.SPANSTORIES_NO_DEV_DISK_CACHE === '1'
    ? { experimental: { turbopackFileSystemCacheForDev: false } } : {}),
  // Verificación de producción sin limpiar los archivos del visor de desarrollo abierto.
  ...(process.env.SPANSTORIES_STUDIO_BUILD_CHECK === '1' ? { distDir: '.next-studio-check',typescript:{tsconfigPath:'tsconfig.studio-check.json'} } : {}),
  // 90 para la ilustración de la cabecera de Niveles; 75 es el valor por defecto.
  images: { qualities: [75, 90] },
  // El lector también se prueba desde 127.0.0.1; sin este origen, Next sirve el
  // HTML pero bloquea los recursos del cliente y los controles quedan inactivos.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
