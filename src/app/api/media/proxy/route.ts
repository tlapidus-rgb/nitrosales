// Media proxy — sirve imagenes/videos de CDNs externos (Meta/Google) evitando
// CORS y hot-linking. Uso: /api/media/proxy?url=<encoded>
//
// Por que existe:
//   - Las URLs de Meta (scontent-*.fbcdn.net, video.xx.fbcdn.net) tienen CORS
//     restrictivo y ademas exigen Referer del dominio facebook.com. Si las
//     pegamos directo en un <img> o <video> desde nitrosales.vercel.app, fallan.
//   - Este proxy las pide server-side con el Referer correcto y las re-emite
//     con Access-Control-Allow-Origin: *.
//
// Seguridad: solo permite hosts de allowlist (Meta + Google).

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const ALLOWED_HOSTS = [
  // Meta / Facebook
  "fbcdn.net",
  "facebook.com",
  "cdninstagram.com",
  // Google
  "googleusercontent.com",
  "ggpht.com",
  "youtube.com",
  "ytimg.com",
  "doubleclick.net",
  // TikTok (futuro)
  "tiktokcdn.com",
];

function isAllowedHost(url: URL): boolean {
  const h = url.hostname.toLowerCase();
  return ALLOWED_HOSTS.some((allowed) => h === allowed || h.endsWith("." + allowed));
}

function refererFor(url: URL): string {
  const h = url.hostname.toLowerCase();
  if (h.includes("fbcdn") || h.includes("facebook")) return "https://www.facebook.com/";
  if (h.includes("instagram")) return "https://www.instagram.com/";
  if (h.includes("youtube") || h.includes("ytimg")) return "https://www.youtube.com/";
  if (h.includes("googleusercontent") || h.includes("ggpht")) return "https://www.google.com/";
  return "";
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url");
  if (!raw) {
    return NextResponse.json({ error: "Missing url param" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return NextResponse.json({ error: "Unsupported protocol" }, { status: 400 });
  }

  if (!isAllowedHost(target)) {
    return NextResponse.json({ error: "Host not allowed", host: target.hostname }, { status: 403 });
  }

  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,video/*,*/*;q=0.8",
  };
  const referer = refererFor(target);
  if (referer) headers.Referer = referer;

  // Forward range requests para video streaming
  const range = req.headers.get("range");
  if (range) headers.Range = range;

  try {
    const upstream = await fetch(target.toString(), { headers, redirect: "follow" });

    if (!upstream.ok && upstream.status !== 206) {
      return NextResponse.json(
        { error: "Upstream error", status: upstream.status, statusText: upstream.statusText },
        { status: 502 }
      );
    }

    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    const contentLength = upstream.headers.get("content-length");
    const acceptRanges = upstream.headers.get("accept-ranges");
    const contentRange = upstream.headers.get("content-range");

    const resHeaders: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "X-Proxy-Status": String(upstream.status),
    };
    if (contentLength) resHeaders["Content-Length"] = contentLength;
    if (acceptRanges) resHeaders["Accept-Ranges"] = acceptRanges;
    if (contentRange) resHeaders["Content-Range"] = contentRange;

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: resHeaders,
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Fetch failed", message: e?.message }, { status: 502 });
  }
}

export async function HEAD(req: NextRequest) {
  return GET(req);
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "range",
    },
  });
}
