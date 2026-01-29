# AGENTS

This file defines how automated agents should work in this repository.

## Project overview
MC Tunnel UI is a cross-platform Electron desktop UI for running a Cloudflare Access TCP tunnel to a local Minecraft server. The product prioritizes safe configuration, explicit user intent, and operational guardrails.

## Primary goals
- Provide a clear, safe UI for configuring and running a Cloudflare Access TCP tunnel.
- Prevent accidental or unsafe defaults (no auto-filled host/bind values).
- Fail fast with actionable feedback (preflight checks, log clarity).
- Keep behavior predictable across Windows, macOS, and Linux.

## Non-goals
- Do not automate server administration or modify Minecraft server files.
- Do not manage or store Cloudflare credentials or tokens.
- Do not auto-start or auto-bind without explicit user configuration.

## Repo layout
- `src/main/` Electron main process (app lifecycle, system integration).
- `src/renderer/` UI assets and renderer code.
- `tests/` Node-based validation tests.
- `package.json` scripts and build metadata.
- `CHANGELOG.md` release notes.
- `WHITEPAPER.md` architecture, security, and risk analysis.

## Commands
- Install: `npm install`
- Run (dev): `npm run start`
- Package: `npm run pack`
- Package (dir only): `npm run pack:dir`
- Tests: `npm test`
- Lint (placeholder): `npm run lint`

## Versioning and releases
- Follow Semantic Versioning.
- Bump version in `package.json` and `package-lock.json`.
- Update `CHANGELOG.md` with a dated release entry.
- Tags must be `vX.Y.Z`.

## Quality bar
- Changes should not reduce safety checks or introduce auto-filled defaults.
- UI changes should include a quick manual smoke test (open app, load profile, run preflight, start/stop tunnel).
- Prefer explicit error messages over silent fallbacks.

## Security expectations
- Treat hostname, bind addresses, and tunnel parameters as sensitive configuration.
- Avoid logging secrets or full URLs that may contain tokens.
- Do not add background network calls without user action.
- If adding downloads, require checksum verification or clearly document integrity limitations.

## Documentation standards
- README should remain the canonical quickstart and feature overview.
- CHANGELOG must include user-facing changes.
- WHITEPAPER should document security model, assumptions, and limitations.

## When in doubt
- Prefer safer defaults and explicit user confirmation.
- Ask for clarification before changing behavior that affects network access or system resources.
