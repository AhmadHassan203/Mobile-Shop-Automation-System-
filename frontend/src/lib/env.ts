const LOCAL_API_BASE_URL = "http://localhost:4000/api/v1";

/**
 * Resolve the browser-safe API origin. The value is public by definition and
 * must never contain database credentials, session secrets, or tokens.
 */
export function getApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  const candidate =
    configured === undefined || configured.length === 0
      ? LOCAL_API_BASE_URL
      : configured;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch (cause) {
    throw new Error(
      "NEXT_PUBLIC_API_BASE_URL must be an absolute HTTP(S) URL.",
      { cause },
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must use HTTP or HTTPS.");
  }
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must not contain credentials.");
  }
  if (parsed.search.length > 0 || parsed.hash.length > 0) {
    throw new Error(
      "NEXT_PUBLIC_API_BASE_URL must not contain a query string or fragment.",
    );
  }

  return parsed.toString().replace(/\/$/, "");
}
