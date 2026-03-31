// ══════════════════════════════════════════════════════════════
// MercadoLibre OAuth — Redirect to ML login
// ══════════════════════════════════════════════════════════════
// Redirects the user to MercadoLibre's authorization page.
// After login, ML redirects back to /api/auth/mercadolibre/callback
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";

const ML_APP_ID = process.env.ML_APP_ID || "5750438437863167";
const ML_REDIRECT_URI = process.env.ML_REDIRECT_URI || "https://nitrosales.vercel.app/api/auth/mercadolibre/callback";

export async function GET(req: NextRequest) {
  // offline_access scope ensures ML returns a refresh_token for long-lived access
  const authUrl = `https://auth.mercadolibre.com.ar/authorization?response_type=code&client_id=${ML_APP_ID}&redirect_uri=${encodeURIComponent(ML_REDIRECT_URI)}&scope=offline_access`;

  return NextResponse.redirect(authUrl);
}
