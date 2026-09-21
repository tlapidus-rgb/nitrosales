// Limitador local en memoria. No provee limites compartidos entre instancias.
// La autenticacion de creadores usa creator-password.ts y PostgreSQL.

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
