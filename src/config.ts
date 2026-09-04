import { readWindowsCredential } from "./credential.js";

export interface Pop3Config {
  host: string;
  port: number;
  username: string;
  password: string;
  timeoutMs: number;
  maxMessageBytes: number;
}

function integerEnv(name: string, fallback: number, minimum: number, maximum: number): number {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

export function loadConfig(): Pop3Config {
  const host = process.env.POP3_HOST?.trim() ?? "";
  const username = process.env.POP3_USERNAME?.trim() ?? "";
  const credentialTarget = process.env.POP3_CREDENTIAL_TARGET?.trim() ?? "";
  const password = credentialTarget
    ? readWindowsCredential(credentialTarget)
    : process.env.POP3_PASSWORD ?? "";
  const missing = [
    ["POP3_HOST", host],
    ["POP3_USERNAME", username],
    ["POP3_PASSWORD or POP3_CREDENTIAL_TARGET", password]
  ].filter(([, value]) => !value).map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  return {
    host,
    username,
    password,
    port: integerEnv("POP3_PORT", 995, 1, 65535),
    timeoutMs: integerEnv("POP3_TIMEOUT_MS", 20_000, 1_000, 120_000),
    maxMessageBytes: integerEnv("POP3_MAX_MESSAGE_BYTES", 10 * 1024 * 1024, 1024, 100 * 1024 * 1024)
  };
}

