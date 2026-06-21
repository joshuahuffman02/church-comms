# Security Policy

## Supported Versions

Church Comms is pre-`v1.0.0`. Security fixes target the latest `main` branch
until versioned releases begin.

## Reporting A Vulnerability

Please do not open a public issue for vulnerabilities, leaked credentials, or
private church data exposure.

Report privately to the project maintainer through GitHub private vulnerability
reporting if enabled, or by contacting the maintainer directly.

Include:

- A clear description of the issue.
- Steps to reproduce.
- Impact and affected versions or commits.
- Any suggested fix, if known.

## Handling Secrets And Data

Never commit:

- `.env` files.
- SQLite databases such as `dev.db`.
- Backup files.
- Planning Center credentials or tokens.
- SMTP credentials.
- Real requester contact information.
- Private church calendars or event exports.

If a secret is committed, rotate it immediately and remove it from history before
publishing.
