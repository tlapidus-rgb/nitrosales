// ══════════════════════════════════════════════════════════════════════════
// src/lib/rate-limit.ts — cuántos intentos se permiten, y cada cuánto
// ══════════════════════════════════════════════════════════════════════════
// R-04. El endpoint que verifica la contraseña del dashboard de un creador
// (`/api/public/influencers/{slug}/{code}/verify`) es un POST **público, sin
// sesión y sin ningún límite**, que devuelve `{valid: true|false}`.
//
// O sea: un oráculo de fuerza bruta. Y lo que protege no es poca cosa — con esa
// clave se ve la facturación, las comisiones y las órdenes atribuidas a ese
// creador. El `slug` y el `code` son públicos (el link del dashboard es
// `/i/<orgSlug>/<code>`), la clave la elige el creador, y el hash es SHA-256 sin
// sal, así que una clave recuperada rompe también la de cualquier otro creador
// que use la misma.
//
// ── POR QUÉ NO SE COPIÓ EL LIMITADOR DEL ARCHIVO DE AL LADO ──────────────
// El hermano (`[code]/route.ts`) tiene uno de **1 request por segundo por IP**.
// Para servir una página está bien. Para un oráculo de contraseña no: son 86.400
// intentos por día desde una sola IP, y un PIN de cuatro dígitos se agota en dos
// horas.
//
// ── EL CRITERIO ──────────────────────────────────────────────────────────
// Se cuentan los intentos **por identidad**, no por request, y la identidad
// incluye lo que se está atacando (el código del creador) además de quién
// ataca (la IP). Sin eso, rotar IPs —que es gratis— evade el límite entero.
//
// El presupuesto no se renueva de a poco: la ventana es fija y al agotarse hay
// que esperarla completa. Es más duro que un token bucket y es lo que se quiere
// acá, porque no hay ningún caso legítimo en que alguien tipee mal su clave
// veinte veces seguidas.
//
// ── LO QUE ESTO NO ES ────────────────────────────────────────────────────
// Es un `Map` en memoria del proceso. En Vercel cada lambda tiene el suyo, así
// que el límite real es por instancia y un atacante con suerte consigue algunos
// intentos de más. **Sigue bajando el techo en varios órdenes de magnitud** y no
// necesita infraestructura nueva. El límite de verdad —compartido entre
// instancias— necesita Redis o una tabla, y es una decisión aparte.
// ══════════════════════════════════════════════════════════════════════════

type Intento = { desde: number; cuenta: number };

/** Un limitador independiente, con su propia memoria y su propio presupuesto. */
export type Limitador = {
  /** `true` si este intento hay que rechazarlo. Cuenta el intento. */
  superado: (identidad: string, ahora?: number) => boolean;
  /** Cuántos intentos le quedan a esa identidad. Para el mensaje de error. */
  restantes: (identidad: string, ahora?: number) => number;
  /** Borra el registro de una identidad. Se llama al acertar la clave. */
  olvidar: (identidad: string) => void;
};

/**
 * @param maxIntentos  cuántos se permiten dentro de la ventana
 * @param ventanaMs    cuánto dura la ventana
 * @param maxIdentidades tope de memoria: al superarlo se descartan las entradas
 *                     más viejas. Evita que el `Map` crezca sin límite, que
 *                     sería otra forma de tumbar el proceso.
 */
export function crearLimitador(
  maxIntentos: number,
  ventanaMs: number,
  maxIdentidades = 10_000,
): Limitador {
  const vistos = new Map<string, Intento>();

  function limpiar(ahora: number) {
    for (const [k, v] of vistos) {
      if (ahora - v.desde >= ventanaMs) vistos.delete(k);
    }
    // Si después de limpiar sigue lleno, se tiran las más viejas. `Map` itera en
    // orden de inserción, así que las primeras son las más antiguas.
    if (vistos.size > maxIdentidades) {
      const sobran = vistos.size - maxIdentidades;
      let i = 0;
      for (const k of vistos.keys()) {
        if (i++ >= sobran) break;
        vistos.delete(k);
      }
    }
  }

  return {
    superado(identidad, ahora = Date.now()) {
      limpiar(ahora);
      const previo = vistos.get(identidad);

      if (!previo || ahora - previo.desde >= ventanaMs) {
        vistos.set(identidad, { desde: ahora, cuenta: 1 });
        return false;
      }

      previo.cuenta++;
      // Se rechaza AL superar, no al llegar: con maxIntentos = 5, el quinto
      // intento todavía entra y el sexto no.
      return previo.cuenta > maxIntentos;
    },

    restantes(identidad, ahora = Date.now()) {
      const previo = vistos.get(identidad);
      if (!previo || ahora - previo.desde >= ventanaMs) return maxIntentos;
      return Math.max(0, maxIntentos - previo.cuenta);
    },

    olvidar(identidad) {
      vistos.delete(identidad);
    },
  };
}

/**
 * El limitador de los intentos de contraseña del dashboard de creadores.
 *
 * 5 intentos por minuto. Un creador que tipea mal su clave dos o tres veces no
 * se entera de que existe; una fuerza bruta pasa de 86.400 intentos diarios a
 * 7.200 **por instancia de lambda y por código atacado**, y eso contra un
 * espacio de claves que el creador eligió.
 */
export const limiteDeClaveDeCreador = crearLimitador(5, 60_000);
