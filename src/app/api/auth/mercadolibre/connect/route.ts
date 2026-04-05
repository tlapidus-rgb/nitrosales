// ══════════════════════════════════════════════════════════════
// MercadoLibre OAuth — Redirect to ML login
// ══════════════════════════════════════════════════════════════
// Redirects the user to MercadoLibre's authorization page.
// After login, ML redirects back to /api/auth/mercadolibre/callback
// Uses PKCE (Proof Key for Code Exchange) for extra security.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const ML_APP_ID = process.env.ML_APP_ID || "5750438437863167";
const ML_REDIRECT_URI = process.env.ML_REDIRECT_URI || "https://nitrosales.vercel.app/api/auth/mercadolibre/callback";

// Generate a random code_verifier (43-128 chars, URL-safe)
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

// SHA256 hash the verifier → base64url encoded = code_challenge
function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export async function GET(req: NextRequest) {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  // offline_access scope ensures ML returns a refresh_token for long-lived access
  const authUrl = `https://auth.mercadolibre.com.ar/authorization?response_type=code&client_id=${ML_APP_ID}&redirect_uri=${encodeURIComponent(ML_REDIRECT_URI)}&scope=offline_access&code_challenge=${codeChallenge}&code_challenge_method=S256`;

  // Store code_verifier in a secure httpOnly cookie for the callback to use
  const response = NextResponse.redirect(authUrl);
  response.cookies.set("ml_pkce_verifier", codeVerifier, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/auth/mercadolibre",
    maxAge: 600, // 10 minutes — more than enough for the OAuth flow
  });

  return response;
}
