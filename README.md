# Read-only POP3 MCP

A local Node.js MCP server that lets Codex list, read, and search message headers in a
POP3 mailbox. It deliberately provides no send, delete, move, mark-as-read, or
attachment-download operation.

## Safety properties

- POP3 over TLS with normal certificate verification
- No SMTP dependency or tool
- No POP3 `DELE` command
- Attachment metadata only; attachment bytes are not returned
- Message size and returned-body limits
- Password is accepted only through the process environment
- Email is explicitly labeled as untrusted content in MCP instructions

POP3 does not provide server-side full-text search. `search_message_headers`
therefore scans recent headers only. The server uses `UIDL` as the stable message
identifier.

## Requirements

- Node.js 20 or newer
- A POP3 server with TLS, normally port 995
- The mailbox configured to retain server copies if another client such as
  Outlook also downloads messages

## Install

From a cloned repository:

```powershell
npm install
npm test
```

Set credentials only for the current PowerShell session:

```powershell
$env:POP3_HOST = "mail.example.com"
$env:POP3_PORT = "995"
$env:POP3_USERNAME = "your-email@example.com"
$env:POP3_PASSWORD = Read-Host "POP3 password"
```

The last command keeps the password out of shell history, but an environment
variable is still visible to processes running as the same Windows user. For a
persistent installation, use a dedicated launcher that reads Windows Credential
Manager and injects the password into the child process.

## Run with npx

```powershell
npx --yes github:YOUR_GITHUB_ID/readonly-pop3-mcp
```

## Connect to Codex desktop

Open **Settings > MCP servers > Add server**, select **STDIO**, set the command to
`npx`, and set arguments to `--yes github:YOUR_GITHUB_ID/readonly-pop3-mcp`.
Add `POP3_HOST`, `POP3_PORT`, `POP3_USERNAME`, and `POP3_PASSWORD` to the MCP
process environment. Do not put the password in this repository or commit a
Codex configuration file containing it.

Restart Codex, then type `/mcp` to confirm that `Read-only POP3 Mail` is connected.

Available tools:

- `mailbox_status`
- `list_messages`
- `get_message`
- `search_message_headers`

## Environment variables

| Name | Required | Default | Purpose |
| --- | --- | --- | --- |
| `POP3_HOST` | Yes | - | POP3 server hostname |
| `POP3_PORT` | No | `995` | POP3 TLS port |
| `POP3_USERNAME` | Yes | - | Mailbox login |
| `POP3_PASSWORD` | Yes | - | Mailbox password or app password |
| `POP3_TIMEOUT_MS` | No | `20000` | Network timeout in milliseconds |
| `POP3_MAX_MESSAGE_BYTES` | No | `10485760` | Maximum retrievable message size |

## Data handling warning

Tool results may send company email content to the AI service used by the MCP
host. Obtain company approval and follow retention, confidentiality, and personal
information policies before use.

