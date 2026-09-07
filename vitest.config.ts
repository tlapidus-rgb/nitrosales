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
    // ⚠️ TOPE DE PARALELISMO (2026-09-07). Mismo motivo que el timeout de
    // arriba, un escalón más grave: cada archivo con PGlite levanta un Postgres
    // completo en WASM, y ya son más de veinte. Con el paralelismo por defecto
    // (un worker por core) la suite agota la memoria del proceso y los workers
    // se mueren.
    //
    // El síntoma NO se parece a un problema de memoria y ahí está la trampa:
    // `Worker exited unexpectedly`, "Vitest caught 7 unhandled errors", y un
    // conteo de tests que baja sin que ninguno aparezca en rojo. Da toda la
    // impresión de un test roto. Lo que lo delata es un `VirtualAlloc failed`
    // suelto entre el ruido.
    //
    // Con 2 workers la suite entera pasa en ~2 min. Si algún día hace falta más
    // velocidad, la salida no es subir esto: es que los tests de PGlite
    // compartan una instancia en vez de levantar una por archivo.
    maxWorkers: 2,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
