/** Shared response contract for contextual Aurum clients. No server imports. */
export async function leerRespuestaContextual(response: Response): Promise<{ reply: string; aviso: string | null }> {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const fallback = response.status === 429
      ? "Alcanzaste el límite de consultas de Aurum. Esperá un momento y volvé a intentar."
      : response.status === 503
        ? "No se pudo verificar el cupo de Aurum. Intentá nuevamente."
        : response.status === 401 || response.status === 403
          ? "No tenés acceso a Aurum. Revisá tu sesión."
          : "No pude responder ahora. Intentá nuevamente.";
    // Quota responses contain intentional user-facing messages; other errors may expose internals.
    throw new Error((response.status === 429 || response.status === 503) && typeof data?.error === "string"
      ? data.error : fallback);
  }
  if (typeof data?.reply !== "string" || !data.reply.trim()) {
    throw new Error("Aurum devolvió una respuesta incompleta. Intentá nuevamente.");
  }
  const cuota = data.cuota;
  const aviso = typeof cuota?.aviso === "string" && cuota.aviso.trim() ? cuota.aviso
    : cuota?.medicionDisponible === false ? "El consumo de Aurum no está disponible. La respuesta usa el modo de menor costo."
    : cuota?.cercaDelTope === true ? "Tu organización se está acercando al límite de consumo de Aurum." : null;
  return { reply: data.reply, aviso };
}