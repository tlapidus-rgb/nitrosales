// Diagnostic endpoint: tests Google Ads OAuth token ONLY (no full sync)
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST() {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const steps: Record<string, any> = {};

  // Step 1: Check env vars
  const envVars = [
    "GOOGLE_ADS_CLIENT_ID",
    "GOOGLE_ADS_CLIENT_SECRET",
    "GOOGLE_ADS_REFRESH_TOKEN",
    "GOOGLE_ADS_DEVELOPER_TOKEN",
    "GOOGLE_ADS_CUSTOMER_ID",
  ];
  const missing = envVars.filter(k => !process.env[k]);
  steps.envVars = missing.length === 0
    ? "OK - all 5 vars present"
    : `MISSING: ${missing.join(", ")}`;

  if (missing.length > 0) {
    return NextResponse.json({ steps, result: "FAIL - missing env vars" });
  }

  // Step 2: Exchange refresh token for access token
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_ADS_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET || "",
        refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN || "",
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(10000),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      steps.tokenExchange = `FAIL ${tokenRes.status}: ${tokenData.error} - ${tokenData.error_description}`;
      return NextResponse.json({ steps, result: "FAIL - token exchange" });
    }

    steps.tokenExchange = "OK - got access token";
    const accessToken = tokenData.access_token;

    // Step 3: Simple API test (just get customer ID)
    const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || "").replace(/-/g, "");
    const loginCustomerId = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || "").replace(/-/g, "");

    steps.customerId = customerId;

    const testRes = await fetch(
      `https://googleads.googleapis.com/v20/customers/${customerId}/googleAds:searchStream`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "",
          ...(loginCustomerId && { "login-customer-id": loginCustomerId }),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: "SELECT customer.id, customer.descriptive_name FROM customer LIMIT 1" }),
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!testRes.ok) {
      const errText = await testRes.text();
      steps.apiTest = `FAIL ${testRes.status}: ${errText.slice(0, 500)}`;
      return NextResponse.json({ steps, result: "FAIL - API test" });
    }

    const testData = await testRes.json();
    const customerName = testData?.[0]?.results?.[0]?.customer?.descriptiveName || "unknown";
    steps.apiTest = `OK - connected to "${customerName}"`;

    return NextResponse.json({ steps, result: "SUCCESS" });
  } catch (error: any) {
    steps.error = error.message;
    return NextResponse.json({ steps, result: `FAIL - ${error.message}` });
  }
}
