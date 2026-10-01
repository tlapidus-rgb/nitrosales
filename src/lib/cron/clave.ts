// ══════════════════════════════════════════════════════════════════════════
// src/lib/cron/clave.ts — con qué clave se llama a los crons y a /api/sync*
// ══════════════════════════════════════════════════════════════════════════
// Hasta ahora cada cron comparaba la clave a mano, y no todos contra la misma:
// unos contra ADMIN_API_KEY, otros contra NEXTAUTH_SECRET, otros contra una
// variable propia. Con `===` (sin tiempo constante) y sin la ventana de rotación.
// Hoy ADMIN_API_KEY y NEXTAUTH_SECRET valen lo mismo, así que funcionaba; el día
// que se separen —que es el primer paso para dejar de depender del secreto
// filtrado— la mitad de los crons habría dejado de correr en silencio.
//
// `esClaveDeCron` acepta las dos, cada una con su ventana de rotación y en tiempo
// constante. Es exactamente lo que se acepta hoy, pero sobrevive a separarlas.
// Cuando NEXTAUTH_SECRET deje de ser una clave de acceso, se saca de acá y de
// ningún otro lado.
// ══════════════════════════════════════════════════════════════════════════

import { isValidAdminKey } from "@/lib/admin-key";
import { esClaveDeWebhookValida } from "@/lib/webhook-key";
import { coincideConAlguna } from "@/lib/comparacion-segura";

/** La clave de los crons de vercel.json y de /api/sync*. Vacía o ausente: no. */
export function esClaveDeCron(key: string | null | undefined): boolean {
  return isValidAdminKey(key) || esClaveDeWebhookValida(key);
}

/**
 * Una clave propia de una ruta (CRON_SECRET, SYNC_SECRET_KEY), en tiempo
 * constante. Si la variable no está configurada, no habilita nada: antes,
 * `key !== process.env.X` con X sin definir dejaba pasar a quien no mandaba clave.
 */
export function esClavePropia(key: string | null | undefined, propia: string | undefined): boolean {
  return coincideConAlguna(key, propia ?? "", null);
}
