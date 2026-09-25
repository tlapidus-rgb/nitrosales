export function AurumQuotaNotice({ aviso }: { aviso: string | null }) {
  if (!aviso) return null;
  return <p role="status" className="my-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-300">{aviso}</p>;
}