# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Added
- Multi-host incremental runtime: `Start tunnel` now allows adding new hostname targets while existing connections are already running.
- Per-connection runtime controls in the `Tunnel Connections` list (`Start`/`Stop` for each hostname + bind pair).
- Automatic local bind assignment when a hostname has no custom bind configured.
- Managed cloudflared fallback install naming when target binary is busy/in use (side-by-side binary placement).

### Changed
- cloudflared probing now prioritizes user-configured path, then `PATH`, then managed binaries in app `userData/bin`.
- Managed cloudflared binaries are reused across launches to avoid repeated downloads (including macOS).
- Documentation refreshed across README and whitepaper to match multi-host runtime behavior and safety guardrails.

### Fixed
- `Start tunnel` button is no longer locked by existing running connections; it is disabled only during an in-flight start request.
- Per-connection start/stop actions now recover button state correctly after operation failures.
- Improved install-time resilience when replacing cloudflared on systems where the binary is currently occupied.

## [1.0.1] - 2026-01-29
### Added
- AGENTS.md with repo-specific guidance for automated contributors.
- WHITEPAPER.md covering architecture, security model, and operational risks.
- Expanded README with safety model, configuration, and operational guidance.

### Changed
- Documentation standardized to a higher clarity and safety baseline.
- Version bumped to 1.0.1.

## [1.0.0] - 2026-01-29
### Added
- Initial release of MC Tunnel UI.
