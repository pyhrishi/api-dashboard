# Product Requirements Documents (PRDs)

This directory holds the specs engineering builds Zinbit to scale from. **The prototype
is the source of truth** — most PRDs are *reverse-engineered* from what's already built,
then made precise and complete for a production team.

## The pipeline

```
prototype (this repo)  ──►  PRD (docs/prd/*.md)  ──►  engineering builds to scale
        │                        │
   what it does            what it must do,          real DB, verified auth,
   (demonstrated)          precisely + at scale      server-enforced RBAC, …
```

## How to create / update a PRD

Use the **`prd` skill** (or the `/prd` command):
- **Reverse-engineer** an existing feature — reads its route, store slice, gateway backend, and tests, then derives the spec.
- **Author** a brand-new feature from the template.
- **Update** an existing PRD — revise the affected sections, bump `Status`, append to the Changelog.

Template: [`prd-template.md`](./prd-template.md) (canonical copy lives in `.claude/skills/prd/references/`).
Every PRD calls out **prototype-simulated vs production-required** gaps (in-memory store → real DB, unverified JWT → verified, client RBAC → server-enforced, mock data → real pipelines).

## Naming

`docs/prd/<area>-<feature>.md` — e.g. `partners-revenue-share.md`, `keys-lifecycle.md`.

## Index

| PRD | Area | Status | Prototype route(s) |
|---|---|---|---|
| [Partner Revenue-Share](./partners-revenue-share.md) | Partners | Draft | `/console/partners`, `/api/v1/partner/*` |

_Add a row here whenever you create a PRD._
