/**
 * Reads a JSON request body with a hard size limit, for the API routes.
 */

export type JsonBodyError = "unsupported_media_type" | "payload_too_large" | "invalid_json";

export type JsonBodyResult = { ok: true; value: unknown } | { ok: false; error: JsonBodyError };

export function isJsonContentType(request: Request) {
  const mediaType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  return mediaType === "application/json";
}

/**
 * Checks the Content-Type, rejects bodies over `maxBytes` (from Content-Length when
 * present, and while reading, since the header can be missing or wrong), then parses JSON.
 */
export async function readJsonBody(request: Request, maxBytes: number): Promise<JsonBodyResult> {
  if (!isJsonContentType(request)) {
    return { ok: false, error: "unsupported_media_type" };
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { ok: false, error: "payload_too_large" };
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  if (request.body) {
    const reader = request.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          void reader.cancel().catch(() => undefined);
          return { ok: false, error: "payload_too_large" };
        }
        chunks.push(value);
      }
    } catch {
      return { ok: false, error: "invalid_json" };
    }
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, error: "invalid_json" };
  }

  if (!text.trim()) {
    return { ok: false, error: "invalid_json" };
  }

  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, error: "invalid_json" };
  }
}
