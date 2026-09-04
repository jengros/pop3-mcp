import assert from "node:assert/strict";
import { test } from "node:test";
import { parseImageAttachment, parseMessage } from "./pop3.js";

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
  assert.deepEqual(result.attachments, [{ index: 0, filename: "a.bin", contentType: "application/octet-stream", sizeBytes: 3, contentId: "" }]);
});

test("returns an image attachment as base64", async () => {
  const raw = Buffer.from([
    "From: sender@example.com", "To: receiver@example.com", "Subject: Image",
    "MIME-Version: 1.0", "Content-Type: multipart/related; boundary=x", "",
    "--x", "Content-Type: text/plain; charset=utf-8", "", "hello",
    "--x", "Content-Type: image/png; name=pixel.png",
    "Content-Disposition: inline; filename=pixel.png", "Content-ID: <pixel>",
    "Content-Transfer-Encoding: base64", "", "iVBORw0KGgo=", "--x--"
  ].join("\r\n"));
  const result = await parseImageAttachment(raw, 0, 1024);
  assert.equal(result.filename, "pixel.png");
  assert.equal(result.contentType, "image/png");
  assert.equal(result.contentId, "<pixel>");
  assert.equal(result.data, "iVBORw0KGgo=");
});

test("rejects non-image attachments and oversized images", async () => {
  const nonImage = Buffer.from([
    "Content-Type: application/octet-stream; name=a.bin",
    "Content-Disposition: attachment; filename=a.bin", "Content-Transfer-Encoding: base64", "", "YWJj"
  ].join("\r\n"));
  await assert.rejects(() => parseImageAttachment(nonImage, 0, 1024), /not an image/);
  const image = Buffer.from([
    "Content-Type: image/png; name=a.png", "Content-Disposition: attachment; filename=a.png",
    "Content-Transfer-Encoding: base64", "", "YWJj"
  ].join("\r\n"));
  await assert.rejects(() => parseImageAttachment(image, 0, 2), /exceeds maxBytes/);
});


