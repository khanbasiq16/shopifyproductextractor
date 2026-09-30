import { NextResponse } from "next/server";
import { inspectStore, fetchCatalogPage } from "@/lib/shopify";
import { StoreError } from "@/lib/errors";
import { errorResponse, readJsonBody, toPage } from "@/lib/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/products
 *
 * First call:       { "storeUrl": "example-store.com" }
 *   -> validates, detects Shopify, picks a public catalog source,
 *      returns store info + page 1.
 *
 * Following calls:  { "storeUrl": "https://example-store.com", "page": 2,
 *                     "source": "products", "currency": "USD" }
 *   -> returns that page only.
 *
 * The client drives pagination so progress is live and each serverless
 * invocation stays short.
 */
export async function POST(request) {
  const body = await readJsonBody(request);
  const storeUrl = typeof body.storeUrl === "string" ? body.storeUrl : "";

  try {
    if (!storeUrl) throw new StoreError("INVALID_URL", 400);

    const page = toPage(body.page);
    if (page === 1 || !body.source) {
      const result = await inspectStore(storeUrl);
      return NextResponse.json({ ok: true, ...result });
    }

    const result = await fetchCatalogPage({
      storeUrl,
      source: String(body.source),
      page,
      currency: typeof body.currency === "string" ? body.currency : null,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return errorResponse(err);
  }
}
