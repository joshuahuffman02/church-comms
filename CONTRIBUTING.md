# Contributing

Thanks for helping improve Church Comms.

## Development Setup

```bash
npm ci
cp .env.example .env
npm run prisma:generate
npm run db:prepare
ADMIN_PASSWORD='change-me' npx tsx prisma/seed.ts
npm run dev
```

Use demo data locally. Do not commit real church data, SQLite databases,
backups, `.env` files, exported calendars, or Planning Center credentials.

## License For Contributions

By submitting a pull request or other contribution, you agree that your
contribution is licensed to the project under the PolyForm Noncommercial License
1.0.0. Contributions may not add terms that allow commercial resale, paid
hosting, sublicensing, or selling copies of Church Comms without separate
written permission from the maintainer.

## Workflow

1. Create a branch from `main`.
2. Keep changes focused.
3. Add or update tests for behavior changes.
4. Run verification before opening a PR:

```bash
npm run lint
npm test
npm run build
```

## Database Changes

- Use Prisma migrations for schema changes.
- Never edit an applied migration after it has shipped.
- Release notes must call out migrations and any manual upgrade steps.
- Fresh local databases and production instances should run `npm run db:prepare`.
- Production instances should never run `prisma migrate dev`.

## Documentation

Update README or docs when setup, configuration, workflows, or release behavior
changes. Keep docs generic and reusable across churches.

## Security And Privacy

Do not include personally identifiable requester data, private event lists,
credentials, or local machine paths in issues, PRs, fixtures, tests, or docs.
Use synthetic examples.
