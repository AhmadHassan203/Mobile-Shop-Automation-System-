export type LoginRedirectReason = "session-expired";

const DEFAULT_RETURN_TARGET = "/";
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/**
 * Accept only a same-origin application path. This value is eventually passed
 * to router.replace, so rejecting protocol-relative URLs and backslashes is an
 * open-redirect boundary, not merely input cleanup.
 */
export function safeReturnTarget(value: string | null | undefined): string {
  if (
    value === null ||
    value === undefined ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    CONTROL_CHARACTERS.test(value)
  ) {
    return DEFAULT_RETURN_TARGET;
  }

  try {
    const parsed = new URL(value, "https://mobileshop.invalid");
    if (parsed.origin !== "https://mobileshop.invalid") {
      return DEFAULT_RETURN_TARGET;
    }

    const decodedPath = decodeURIComponent(parsed.pathname);
    if (
      decodedPath.startsWith("//") ||
      decodedPath.includes("\\") ||
      parsed.pathname === "/login" ||
      parsed.pathname.startsWith("/login/")
    ) {
      return DEFAULT_RETURN_TARGET;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return DEFAULT_RETURN_TARGET;
  }
}

export function buildLoginRedirect(
  returnTarget: string,
  reason?: LoginRedirectReason,
): string {
  const parameters = new URLSearchParams({
    returnTo: safeReturnTarget(returnTarget),
  });
  if (reason !== undefined) parameters.set("reason", reason);
  return `/login?${parameters.toString()}`;
}
