const DEFAULT_FRONTEND_BASE_URL = "http://localhost:3000";

export interface OwnerCredentials {
  readonly email: string;
  readonly password: string;
}

function configuredValue(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value.length === 0 ? undefined : value;
}

function absoluteHttpUrl(value: string, variableName: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch (cause) {
    throw new Error(`${variableName} must be an absolute URL.`, { cause });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${variableName} must use HTTP or HTTPS.`);
  }
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    throw new Error(`${variableName} must not contain credentials.`);
  }
  if (parsed.search.length > 0 || parsed.hash.length > 0) {
    throw new Error(
      `${variableName} must not contain a query string or fragment.`,
    );
  }

  return parsed.toString().replace(/\/$/u, "");
}

export function frontendBaseUrl(): string {
  return absoluteHttpUrl(
    configuredValue("E2E_FRONTEND_BASE_URL") ?? DEFAULT_FRONTEND_BASE_URL,
    "E2E_FRONTEND_BASE_URL",
  );
}

export function ownerCredentialsConfigured(): boolean {
  const emailConfigured = configuredValue("E2E_OWNER_EMAIL") !== undefined;
  const passwordConfigured =
    configuredValue("E2E_OWNER_PASSWORD") !== undefined;

  if (emailConfigured !== passwordConfigured) {
    throw new Error(
      "E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD must either both be set or both be absent.",
    );
  }

  return emailConfigured;
}

export function ownerCredentials(): OwnerCredentials {
  const email = configuredValue("E2E_OWNER_EMAIL")?.trim();
  const password = configuredValue("E2E_OWNER_PASSWORD");

  if (email === undefined || email.length === 0 || password === undefined) {
    throw new Error(
      "E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD are required for the authenticated browser test.",
    );
  }

  return { email, password };
}
