// ══════════════════════════════════════════════════════════════
// MercadoLibre OAuth Callback
// ══════════════════════════════════════════════════════════════
// Handles the redirect from ML after user authorizes the app.
// Exchanges the auth code for access_token + refresh_token,
// then stores them in the Connection table.
//
// Flow:
//   1. User clicks auth URL → ML login → ML redirects here with ?code=XXX
//   2. We exchange code for tokens
//   3. Store tokens in Connection table
//   4. Redirect user to dashboard with success message
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

const ML_APP_ID = process.env.ML_APP_ID || "5750438437863167";
const ML_SECRET = process.env.ML_SECRET_KEY || "4WBCq5f9ejpT4U62KGjG0q08koi0bPxt";
const ML_REDIRECT_URI = process.env.ML_REDIRECT_URI || "https://nitrosales.vercel.app/api/auth/mercadolibre/callback";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  // If ML returned an error
  if (error) {
    console.error("[ML OAuth] Error from ML:", error, searchParams.get("error_description"));
    return NextResponse.redirect(
      new URL(`/competitors?ml_error=${encodeURIComponent(error)}`, req.url)
    );
  }

  if (!code) {
    return NextResponse.json({ error: "No authorization code received" }, { status: 400 });
  }

  try {
    // Read PKCE code_verifier from cookie (set by connect endpoint)
    const codeVerifier = req.cookies.get("ml_pkce_verifier")?.value;

    // Exchange code for tokens (ML requires x-www-form-urlencoded per official docs)
    const tokenParams: Record<string, string> = {
      grant_type: "authorization_code",
      client_id: ML_APP_ID,
      client_secret: ML_SECRET,
      code,
      redirect_uri: ML_REDIRECT_URI,
    };
    // Include PKCE verifier if available
    if (codeVerifier) {
      tokenParams.code_verifier = codeVerifier;
    }
    const tokenBody = new URLSearchParams(tokenParams);

    const tokenRes = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: tokenBody.toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("[ML OAuth] Token exchange failed:", tokenRes.status, errText);
      return NextResponse.redirect(
        new URL(`/competitors?ml_error=token_exchange_failed`, req.url)
      );
    }

    const tokenData = await tokenRes.json();
    const { access_token, refresh_token, expires_in, user_id } = tokenData;

    console.log(`[ML OAuth] Got tokens for ML user ${user_id}, expires in ${expires_in}s, refresh_token: ${refresh_token ? 'YES' : 'NO'}`);

    // Find existing ML connection (we created one earlier with client_credentials)
    const existing = await prisma.connection.findFirst({
      where: { platform: "MERCADOLIBRE" as any },
    });

    const credentials = {
      appId: ML_APP_ID,
      secretKey: ML_SECRET,
      accessToken: access_token,
      refreshToken: refresh_token,
      tokenExpiresAt: Date.now() + (expires_in * 1000),
      mlUserId: user_id,
    };

    if (existing) {
      // Update existing connection with user tokens
      await prisma.connection.update({
        where: { id: existing.id },
        data: {
          credentials: credentials as any,
          status: "ACTIVE",
          lastSyncAt: new Date(),
        },
      });
    } else {
      // Create new connection (shouldn't happen normally)
      const org = await prisma.organization.findFirst();
      if (org) {
        await prisma.connection.create({
          data: {
            organizationId: org.id,
            platform: "MERCADOLIBRE" as any,
            status: "ACTIVE",
            credentials: credentials as any,
          },
        });
      }
    }

    // Redirect to competitors page with success (and clean up PKCE cookie)
    const successRedirect = NextResponse.redirect(
      new URL(`/competitors?ml_connected=true`, req.url)
    );
    successRedirect.cookies.delete("ml_pkce_verifier");
    return successRedirect;
  } catch (err: any) {
    console.error("[ML OAuth] Error:", err);
    return NextResponse.redirect(
      new URL(`/competitors?ml_error=${encodeURIComponent(err.message)}`, req.url)
    );
  }
}
