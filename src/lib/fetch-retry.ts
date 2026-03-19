// fetchWithRetry — NitroSales [FASE 2.1]
// Exponential backoff para APIs externas (VTEX, GA4, Meta, Google Ads)
// Reintenta en 429, 500, 502, 503, 504. NO reintenta en 400, 401, 403, 404.

interface RetryOptions {
  maxRetries?: number;
  backoffMs?: number;
  maxBackoffMs?: number;
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export async function fetchWithRetry(
  url: string,
  opts: RequestInit = {},
  retryOpts: RetryOptions = {}
): Promise<Response> {
  const { maxRetries = 3, backoffMs = 1000, maxBackoffMs = 30000 } = retryOpts;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, opts);

      if (response.ok || !RETRYABLE_STATUS.has(response.status)) {
        return response;
      }

      // Retryable error
      if (attempt === maxRetries) {
        return response; // Return the failed response on last attempt
      }

      // Check Retry-After header (common for 429)
      const retryAfter = response.headers.get("Retry-After");
      const waitMs = retryAfter
        ? parseInt(retryAfter) * 1000
        : Math.min(backoffMs * Math.pow(2, attempt) + Math.random() * 500, maxBackoffMs);

      console.warn(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "warn",
          service: "fetchWithRetry",
          action: "retry",
          details: { attempt: attempt + 1, maxRetries, status: response.status, waitMs, url: url.substring(0, 80) },
        })
      );

      await new Promise((r) => setTimeout(r, waitMs));
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxRetries) {
        throw lastError;
      }

      const waitMs = Math.min(backoffMs * Math.pow(2, attempt) + Math.random() * 500, maxBackoffMs);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  throw lastError || new Error("fetchWithRetry: max retries exceeded");
}
