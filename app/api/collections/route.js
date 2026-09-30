import { NextResponse } from "next/server";
import { fetchCollectionsPage, fetchCollectionProductIds } from "@/lib/shopify";
import { StoreError } from "@/lib/errors";
import { errorResponse, readJsonBody, toPage } from "@/lib/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/collections
 *   { action: "list", storeUrl, page }              -> public collections
 *   { action: "products", storeUrl, handle, page }  -> product IDs in a collection
 */
export async function POST(request) {
  const body = await readJsonBody(request);
  const storeUrl = typeof body.storeUrl === "string" ? body.storeUrl : "";
  const page = toPage(body.page);

  try {
    if (!storeUrl) throw new StoreError("INVALID_URL", 400);

    if (body.action === "list") {
      return NextResponse.json({ ok: true, ...(await fetchCollectionsPage({ storeUrl, page })) });
    }
    if (body.action === "products") {
      const handle = typeof body.handle === "string" ? body.handle : "";
      return NextResponse.json({
        ok: true,
        ...(await fetchCollectionProductIds({ storeUrl, handle, page })),
      });
    }
    throw new StoreError("INVALID_URL", 400, "Unknown action");
  } catch (err) {
    return errorResponse(err);
  }
}
