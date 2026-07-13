---
feature: readme-v0.1.2
status: delivered
specs: []
plans:
  - docs/compose/plans/2026-07-13-readme-v0.1.2.md
branch: main
commits: b2a56fa
---

# README v0.1.2 - Final Report

## What Was Built

The README is now a concise entry point for MiMo Code WebUI v0.1.2. It describes the active-session experience, directs operators to verify and install the signed v0.1.2 release archive, and separates source startup, configuration, development, operations, and detailed documentation.

## Architecture

`README.md` presents the product and the shortest supported paths. It contains release verification commands for the formal archive and links to `docs/deployment.md`, `docs/operations.md`, `docs/testing.md`, and `docs/architecture.md` for material that requires longer operational procedures.

### Design Decisions

The README keeps deployment transactions, backup recovery, and release-authoring rules in `docs/` because duplicating them at the entry point caused version drift. The formal package name is explicitly `mimo-code-webui-v0.1.2.tar.gz`, with its checksum and detached signature.

## Usage

Verify the release archive with its `.sha256` and `.sig` sidecars before installation. Use the documented installer commands for systemd deployment, `npm run build && npm start` for source startup, and `npm run dev` for local development.

## Verification

- Confirmed README contains no `v0.1.1` references.
- Confirmed every formal release archive example uses `mimo-code-webui-v0.1.2.tar.gz`.
- Ran `git diff --check` successfully.
- Ran `npm run typecheck` successfully for both server and web workspaces.

## Journey Log

> Brief notes on what informed the final design. Not required reading.

- [lesson] The previous README mixed a quick-start guide with operational procedures, so release archive examples drifted to v0.1.1 while the current signed package was v0.1.2.

## Source Materials

| File | Role | Notes |
|------|------|-------|
| `README.md` | Implemented documentation | Current v0.1.2 entry point |
| `docs/compose/plans/2026-07-13-readme-v0.1.2.md` | Implementation plan | Complete |
| `docs/deployment.md` | Deployment reference | Detailed signed-release and systemd procedures |
| `docs/operations.md` | Operations reference | Runtime and recovery procedures |
