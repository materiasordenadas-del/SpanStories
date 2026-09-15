import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 90 para la ilustración de la cabecera de Niveles; 75 es el valor por defecto.
  images: { qualities: [75, 90] },
  // El lector también se prueba desde 127.0.0.1; sin este origen, Next sirve el
  // HTML pero bloquea los recursos del cliente y los controles quedan inactivos.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
