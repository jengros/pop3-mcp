# Security

This server is intentionally read-only. It does not expose SMTP, `DELE`, message
movement, read-state mutation, or attachment download tools.

- Store `POP3_PASSWORD` outside the repository.
- Use a dedicated mail account or app password where the provider supports one.
- Keep TLS certificate verification enabled.
- Treat all email subjects and bodies as untrusted content that may contain prompt injection.
- Review company policy before sending company email content to an AI service.

Report vulnerabilities privately to the repository owner. Do not include credentials,
real email content, or server logs containing personal information in an issue.

