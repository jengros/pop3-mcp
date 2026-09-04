import tls, { TLSSocket } from "node:tls";
import { simpleParser } from "mailparser";
import type { Pop3Config } from "./config.js";

export interface MessageHeader {
  uidl: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  messageId: string;
}

export interface ParsedMessage extends MessageHeader {
  body: string;
  bodyTruncated: boolean;
  attachments: Array<{ filename: string; contentType: string; sizeBytes: number }>;
}

class LineReader {
  private buffer = Buffer.alloc(0);
  private waiters: Array<{ resolve: (line: string) => void; reject: (error: Error) => void }> = [];
  private terminalError: Error | undefined;

  constructor(private readonly socket: TLSSocket) {
    socket.on("data", (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.flush();
    });
    socket.on("error", (error) => this.fail(error));
    socket.on("close", () => this.fail(new Error("POP3 connection closed")));
  }

  readLine(): Promise<string> {
    const line = this.takeLine();
    if (line !== undefined) return Promise.resolve(line);
    if (this.terminalError) return Promise.reject(this.terminalError);
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }

  private takeLine(): string | undefined {
    const index = this.buffer.indexOf("\r\n");
    if (index < 0) return undefined;
    const line = this.buffer.subarray(0, index).toString("latin1");
    this.buffer = this.buffer.subarray(index + 2);
    return line;
  }

  private flush(): void {
    while (this.waiters.length > 0) {
      const line = this.takeLine();
      if (line === undefined) return;
      this.waiters.shift()!.resolve(line);
    }
  }

  private fail(error: Error): void {
    if (this.terminalError) return;
    this.terminalError = error;
    for (const waiter of this.waiters.splice(0)) waiter.reject(error);
  }
}

class Pop3Session {
  private readonly reader: LineReader;

  private constructor(private readonly socket: TLSSocket) {
    this.reader = new LineReader(socket);
  }

  static async connect(config: Pop3Config): Promise<Pop3Session> {
    const socket = tls.connect({
      host: config.host,
      port: config.port,
      servername: config.host,
      rejectUnauthorized: true
    });
    socket.setTimeout(config.timeoutMs, () => socket.destroy(new Error("POP3 connection timed out")));
    await new Promise<void>((resolve, reject) => {
      socket.once("secureConnect", resolve);
      socket.once("error", reject);
    });
    const session = new Pop3Session(socket);
    session.expectOk(await session.reader.readLine());
    await session.single(`USER ${config.username}`);
    await session.single(`PASS ${config.password}`);
    return session;
  }

  async single(command: string): Promise<string> {
    this.write(command);
    const line = await this.reader.readLine();
    this.expectOk(line);
    return line.slice(3).trim();
  }

  async multi(command: string): Promise<string[]> {
    await this.single(command);
    const lines: string[] = [];
    while (true) {
      const line = await this.reader.readLine();
      if (line === ".") return lines;
      lines.push(line.startsWith("..") ? line.slice(1) : line);
    }
  }

  async close(): Promise<void> {
    try {
      if (!this.socket.destroyed) await this.single("QUIT");
    } finally {
      this.socket.destroy();
    }
  }

  private write(command: string): void {
    if (/\r|\n/.test(command)) throw new Error("Invalid POP3 command value");
    this.socket.write(`${command}\r\n`);
  }

  private expectOk(line: string): void {
    if (!line.startsWith("+OK")) {
      const safeMessage = line.replace(/[^\x20-\x7e]/g, "?").slice(0, 300);
      throw new Error(`POP3 server rejected the request: ${safeMessage}`);
    }
  }
}

function addressText(value: { text?: string } | undefined): string {
  return value?.text ?? "";
}

export async function parseMessage(raw: Buffer, uidl: string, maxBodyChars: number): Promise<ParsedMessage> {
  const parsed = await simpleParser(raw, { skipImageLinks: true, skipHtmlToText: false });
  const body = (parsed.text ?? "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return {
    uidl,
    subject: parsed.subject ?? "",
    from: addressText(parsed.from),
    to: addressText(Array.isArray(parsed.to) ? parsed.to[0] : parsed.to),
    date: parsed.date?.toISOString() ?? "",
    messageId: parsed.messageId ?? "",
    body: body.slice(0, maxBodyChars),
    bodyTruncated: body.length > maxBodyChars,
    attachments: parsed.attachments.map((item) => ({
      filename: item.filename ?? "",
      contentType: item.contentType,
      sizeBytes: item.size
    }))
  };
}

function parseUidl(lines: string[]): Array<{ number: number; uidl: string }> {
  return lines.map((line) => {
    const match = /^(\d+)\s+(\S+)$/.exec(line);
    if (!match) throw new Error("POP3 server returned an invalid UIDL response");
    return { number: Number(match[1]), uidl: match[2] };
  });
}

function parseSizes(lines: string[]): Map<number, number> {
  return new Map(lines.map((line) => {
    const match = /^(\d+)\s+(\d+)$/.exec(line);
    if (!match) throw new Error("POP3 server returned an invalid LIST response");
    return [Number(match[1]), Number(match[2])];
  }));
}

async function withSession<T>(config: Pop3Config, operation: (session: Pop3Session) => Promise<T>): Promise<T> {
  const session = await Pop3Session.connect(config);
  try {
    return await operation(session);
  } finally {
    await session.close();
  }
}

async function headerFor(
  session: Pop3Session,
  number: number,
  uidl: string,
  maxMessageBytes: number
): Promise<MessageHeader> {
  let lines: string[];
  try {
    lines = await session.multi(`TOP ${number} 0`);
  } catch (error) {
    const response = await session.single(`LIST ${number}`);
    const match = /^(\d+)\s+(\d+)$/.exec(response);
    const size = match ? Number(match[2]) : maxMessageBytes + 1;
    if (size > maxMessageBytes) {
      throw new Error(`POP3 TOP is unavailable and message ${uidl} is too large for safe RETR fallback`, { cause: error });
    }
    lines = await session.multi(`RETR ${number}`);
  }
  const headerEnd = lines.findIndex((line) => line === "");
  const headerLines = headerEnd >= 0 ? lines.slice(0, headerEnd) : lines;
  const parsed = await simpleParser(Buffer.from(`${headerLines.join("\r\n")}\r\n\r\n`, "latin1"));
  return {
    uidl,
    subject: parsed.subject ?? "",
    from: addressText(parsed.from),
    to: addressText(Array.isArray(parsed.to) ? parsed.to[0] : parsed.to),
    date: parsed.date?.toISOString() ?? "",
    messageId: parsed.messageId ?? ""
  };
}

export class ReadOnlyPop3Client {
  constructor(private readonly config: Pop3Config) {}

  status(): Promise<Record<string, unknown>> {
    return withSession(this.config, async (session) => {
      const response = await session.single("STAT");
      const match = /^(\d+)\s+(\d+)/.exec(response);
      if (!match) throw new Error("POP3 server returned an invalid STAT response");
      return {
        connected: true,
        messageCount: Number(match[1]),
        mailboxSizeBytes: Number(match[2]),
        host: this.config.host,
        port: this.config.port,
        tls: true,
        readOnly: true
      };
    });
  }

  listMessages(limit: number, newestFirst: boolean): Promise<MessageHeader[]> {
    return withSession(this.config, async (session) => {
      const items = parseUidl(await session.multi("UIDL"));
      if (newestFirst) items.reverse();
      const headers: MessageHeader[] = [];
      for (const item of items.slice(0, limit)) {
        headers.push(await headerFor(session, item.number, item.uidl, this.config.maxMessageBytes));
      }
      return headers;
    });
  }

  getMessage(uidl: string, maxBodyChars: number): Promise<ParsedMessage> {
    return withSession(this.config, async (session) => {
      const item = parseUidl(await session.multi("UIDL")).find((candidate) => candidate.uidl === uidl);
      if (!item) throw new Error("Message UIDL was not found");
      const size = parseSizes(await session.multi("LIST")).get(item.number) ?? 0;
      if (size > this.config.maxMessageBytes) {
        throw new Error(`Message exceeds POP3_MAX_MESSAGE_BYTES (${size} > ${this.config.maxMessageBytes})`);
      }
      const lines = await session.multi(`RETR ${item.number}`);
      return parseMessage(Buffer.from(lines.join("\r\n"), "latin1"), uidl, maxBodyChars);
    });
  }

  searchHeaders(query: string, limit: number, scanLimit: number): Promise<MessageHeader[]> {
    return withSession(this.config, async (session) => {
      const items = parseUidl(await session.multi("UIDL")).reverse().slice(0, scanLimit);
      const normalized = query.toLocaleLowerCase();
      const results: MessageHeader[] = [];
      for (const item of items) {
        const header = await headerFor(session, item.number, item.uidl, this.config.maxMessageBytes);
        if (Object.values(header).join(" ").toLocaleLowerCase().includes(normalized)) results.push(header);
        if (results.length >= limit) break;
      }
      return results;
    });
  }
}

