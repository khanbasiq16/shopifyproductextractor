import { NextResponse } from "next/server";
import { StoreError, messageFor } from "./errors.js";

/** Consistent JSON error payloads. Raw technical errors are logged, never returned. */
export function errorResponse(err) {
  if (err instanceof StoreError) {
    return NextResponse.json(
      { ok: false, error: { code: err.code, message: messageFor(err.code) } },
      { status: err.status },
    );
  }
  console.error("[shopify-product-extractor]", err);
  return NextResponse.json(
    { ok: false, error: { code: "UNKNOWN", message: messageFor("UNKNOWN") } },
    { status: 500 },
  );
}

export async function readJsonBody(request) {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

export function toPage(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 1000 ? n : 1;
}
