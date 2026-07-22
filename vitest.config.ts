import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // 30s en vez de los 5s por defecto.
    //
    // Los tests que ejecutan SQL real levantan un Postgres completo compilado a
    // WASM (PGlite) por archivo. Vitest corre los archivos en paralelo, así que
    // varios arranques simultáneos compiten por CPU y el `create()` se pasa de
    // los 5s. Síntoma observado el 2026-07-21: la suite falló 2 veces de ~7
    // corridas, siempre con exactamente 2 tests en rojo y sin reproducirse al
    // ir a mirarla.
    //
    // ⚠️ Es una mitigación por hipótesis, no un diagnóstico confirmado: no se
    // llegó a capturar el error. Encaja con todo (empezó al agregar PGlite, es
    // intermitente, siempre 2 tests) y subir el timeout no puede esconder un
    // fallo real — los tests puros corren en milisegundos. Si el flake vuelve,
    // hay que capturar el mensaje ANTES de tocar nada más: un suite que falla de
    // a ratos se termina ignorando, y ahí se pierde el harness entero.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
