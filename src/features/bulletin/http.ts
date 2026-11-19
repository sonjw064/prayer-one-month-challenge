import { NextResponse } from "next/server";
import { DomainError } from "../../lib/http";

export function failure(error: unknown, headers?: Record<string, string>) {
  if (error instanceof DomainError) {
    return NextResponse.json({ code: error.code }, { status: error.status, headers: headers ?? { "cache-control": "no-store" } });
  }
  throw error;
}

/** Serves a stored page image. `cache` is public for the open bulletin and private for the admin preview. */
export function imageResponse(request: Request, image: { data: Buffer; version: string }, key: string, cache: string) {
  const etag = `"${image.version}-${key}"`;
  const headers = {
    "content-type": "image/webp",
    "cache-control": cache,
    "x-content-type-options": "nosniff",
    "content-disposition": "inline",
    etag,
  };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(new Uint8Array(image.data), { headers });
}
