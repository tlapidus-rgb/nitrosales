/** Local shape check only. Provider permissions/validity need the separate live test. */
export function usableBackfillCredentials(platform: string, credentials: unknown): boolean {
  if (!credentials || typeof credentials !== "object" || Array.isArray(credentials)) return false;
  const c = credentials as Record<string, unknown>;
  if (c.needsSetup) return false;
  const nonempty = (x: unknown): x is string => typeof x === "string" && x.trim().length > 0;
  if (platform === "VTEX") return nonempty(c.accountName) && /^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(c.accountName)
    && nonempty(c.appKey) && nonempty(c.appToken);
  if (platform === "MERCADOLIBRE") return nonempty(c.accessToken)
    && ((typeof c.mlUserId === "string" && /^\d+$/.test(c.mlUserId) && Number(c.mlUserId) > 0)
      || (typeof c.mlUserId === "number" && Number.isSafeInteger(c.mlUserId) && c.mlUserId > 0));
  return false;
}
