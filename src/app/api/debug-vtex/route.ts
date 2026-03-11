import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const account = "elmundodeljuguete";
  const appKey = process.env.VTEX_APP_KEY || "";
  const appToken = process.env.VTEX_APP_TOKEN || "";

  const results: any = { account, hasKey: !!appKey, hasToken: !!appToken, tests: [] };

  // Test 1: List orders (no date filter)
  try {
    const url1 = "https://" + account + ".vtexcommercestable.com.br/api/oms/pvt/orders?per_page=5";
    const r1 = await fetch(url1, {
      headers: { "X-VTEX-API-AppKey": appKey, "X-VTEX-API-AppToken": appToken, "Accept": "application/json" }
    });
    const t1 = await r1.text();
    results.tests.push({ name: "orders_no_filter", status: r1.status, body: t1.substring(0, 500) });
  } catch(e: any) { results.tests.push({ name: "orders_no_filter", error: e.message }); }

  // Test 2: List orders with broader date range (90 days)
  try {
    const now = new Date();
    const ago = new Date(now.getTime() - 90*24*60*60*1000);
    const since = ago.toISOString();
    const until2 = now.toISOString();
    const url2 = "https://" + account + ".vtexcommercestable.com.br/api/oms/pvt/orders?f_creationDate=creationDate:[" + since + " TO " + until2 + "]&per_page=5";
    const r2 = await fetch(url2, {
      headers: { "X-VTEX-API-AppKey": appKey, "X-VTEX-API-AppToken": appToken, "Accept": "application/json" }
    });
    const t2 = await r2.text();
    results.tests.push({ name: "orders_90days", status: r2.status, body: t2.substring(0, 500) });
  } catch(e: any) { results.tests.push({ name: "orders_90days", error: e.message }); }

  // Test 3: Try the account name as-is (maybe it's "mundojuguete" not "elmundodeljuguete")
  try {
    const url3 = "https://mundojuguete.vtexcommercestable.com.br/api/oms/pvt/orders?per_page=5";
    const r3 = await fetch(url3, {
      headers: { "X-VTEX-API-AppKey": appKey, "X-VTEX-API-AppToken": appToken, "Accept": "application/json" }
    });
    const t3 = await r3.text();
    results.tests.push({ name: "orders_alt_account", status: r3.status, body: t3.substring(0, 500) });
  } catch(e: any) { results.tests.push({ name: "orders_alt_account", error: e.message }); }

  return NextResponse.json(results);
}
