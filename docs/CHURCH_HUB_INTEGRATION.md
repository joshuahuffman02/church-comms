# Church Hub Integration

Church Hub is a separate sibling project, published at <https://github.com/joshuahuffman02/church-hub> (checked out beside this repository during development).

The canonical integration design is maintained in the Church Hub project:

- [Architecture and integration plan](https://github.com/joshuahuffman02/church-hub/blob/main/docs/ARCHITECTURE_AND_INTEGRATION.md)
- [Separate-project decision](https://github.com/joshuahuffman02/church-hub/blob/main/docs/decisions/0001-separate-project.md)

## Boundary in this application

Church Communications remains authoritative for:

- Communication intake and requests
- Triage, tiers, and approvals
- Deliverables and production tasks
- Channel schedules and placements
- Proofs, assets, exports, and run sheets
- Communications-specific Planning Center Calendar mirrors

Church Hub will link to this work rather than reimplement it. Planned integration proceeds through:

1. Reciprocal navigation using configured base URLs *(implemented: Hub links out via Settings → communicationsUrl; Comms links back via `CHURCH_HUB_URL`)*
2. Planning Center user and organization identity in both products
3. A signed handoff into `/submit`
4. Safe links to `/requests/{id}` and `/my-requests/{id}`
5. Narrow status summaries and signed webhooks after the basic journey is proven

The applications must not share databases, session cookies, Planning Center tokens, or unrestricted internal APIs.
