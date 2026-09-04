import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMessage } from "./pop3.js";

test("parses body and attachment metadata", async () => {
  const raw = Buffer.from([
    "From: sender@example.com",
    "To: receiver@example.com",
    "Subject: Test",
    "MIME-Version: 1.0",
    "Content-Type: multipart/mixed; boundary=x",
    "",
    "--x",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "hello",
    "--x",
    "Content-Type: application/octet-stream; name=a.bin",
    "Content-Disposition: attachment; filename=a.bin",
    "Content-Transfer-Encoding: base64",
    "",
    "YWJj",
    "--x--"
  ].join("\r\n"));
  const result = await parseMessage(raw, "uid-1", 1000);
  assert.equal(result.body, "hello");
  assert.deepEqual(result.attachments, [{ filename: "a.bin", contentType: "application/octet-stream", sizeBytes: 3 }]);
});


