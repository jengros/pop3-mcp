import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { loadConfig } from "./config.js";

const names = ["POP3_HOST", "POP3_PORT", "POP3_USERNAME", "POP3_PASSWORD", "POP3_CREDENTIAL_TARGET", "POP3_TIMEOUT_MS", "POP3_MAX_MESSAGE_BYTES"];
const original = new Map(names.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const [name, value] of original) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test("requires host, username, and password", () => {
  delete process.env.POP3_HOST;
  delete process.env.POP3_USERNAME;
  delete process.env.POP3_PASSWORD;
  assert.throws(loadConfig, /POP3_HOST/);
});

test("uses secure POP3 defaults", () => {
  process.env.POP3_HOST = "mail.example.com";
  process.env.POP3_USERNAME = "user@example.com";
  process.env.POP3_PASSWORD = "secret";
  delete process.env.POP3_CREDENTIAL_TARGET;
  const config = loadConfig();
  assert.equal(config.port, 995);
  assert.equal(config.timeoutMs, 20_000);
});

