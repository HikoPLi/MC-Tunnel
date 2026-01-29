# MC Tunnel UI Whitepaper

## Executive summary
MC Tunnel UI is a cross-platform Electron application that helps users run a Cloudflare Access TCP tunnel to a local Minecraft server. It is designed to reduce misconfiguration and operational risk by enforcing explicit user intent, preflight validation, and transparent logging. The product does not manage Cloudflare credentials or server configuration; it focuses on safe orchestration of the local tunnel process.

## Audience
- Server administrators and hobbyists who run Minecraft servers.
- Security-conscious users who need safe defaults and transparent behavior.
- Contributors maintaining the application and its release process.

## Problem statement
Running a TCP tunnel to a local service requires careful configuration and operational discipline. Common failure modes include incorrect bind addresses, port conflicts, and lack of visibility into tunnel state. Many tools prioritize speed over safety, leading to hidden defaults and fragile automation. This project aims to provide a UI that is explicit, safe, and predictable.

## Goals
- Make tunnel configuration explicit and easy to audit.
- Fail fast with clear, actionable feedback.
- Provide guardrails that prevent unsafe defaults.
- Maintain predictable behavior across Windows, macOS, and Linux.

## Non-goals
- Manage or store Cloudflare credentials or tokens.
- Modify Minecraft server configuration or files.
- Provide auto-magic network discovery or background automation.

## Architecture overview
MC Tunnel UI is a local desktop application with two main components:
- Electron main process: system integration, process control, filesystem access.
- Renderer UI: configuration UI, status, and user interactions.

The application launches and monitors a local cloudflared process based on user-defined profiles.

## Component model
- Profile manager: stores explicit tunnel settings (hostname, bind, log config, cloudflared path).
- Saved links: stores only hostname + bind pairs for quick setup.
- Preflight checks: verifies port availability and basic binary health before launch.
- Cloudflared management: verifies an existing binary or fetches a release for the current OS/CPU.
- Logging subsystem: captures process output, rotates logs, and exposes log locations.

## Data flow (high level)
1. User selects a saved link or profile.
2. Preflight checks validate port availability and binary health.
3. The app launches cloudflared with explicit parameters.
4. Logs are streamed to UI and persisted to disk.
5. User stops the tunnel; logs and state are updated.

## Security model
### Assets
- Local server availability and configuration.
- Tunnel configuration (hostname, bind address, cloudflared path).
- Log files, which may contain operational metadata.

### Trust boundaries
- Local machine and OS process boundary.
- External network boundary managed by cloudflared and Cloudflare.

### Threats and mitigations
- Misconfiguration leading to exposure: mitigated by explicit inputs and no auto-filled defaults.
- Port conflicts or hijacking: mitigated by preflight checks and user confirmation before termination.
- Tampered cloudflared binary: mitigated by optional checksum enforcement.
- Log leakage of sensitive info: mitigated by avoiding credentials and warning against tokenized URLs.

## Safety controls
- Explicit configuration required before start.
- Preflight port checks before process launch.
- Confirmations for disruptive actions (killing a process on a port).
- Log rotation and limits to avoid disk exhaustion.
- Optional checksum enforcement for downloads.

## Privacy and data handling
- The app stores configuration and logs locally under the OS user data directory.
- No telemetry or background network calls are required for normal use.
- The app does not store Cloudflare credentials or authentication tokens.

## Operational model
- Installation is performed via platform packaging or development scripts.
- Updates are managed via the project release process and packaged artifacts.
- The user controls when to start or stop the tunnel.

## Risk register (selected)
| Risk | Impact | Mitigation |
| --- | --- | --- |
| Incorrect bind address | Tunnel fails or exposes wrong service | Explicit inputs, preflight checks |
| Port already in use | Start failure or app hangs | Port precheck, user prompt |
| Corrupted binary | Unexpected behavior | Checksum enforcement |
| Excessive logs | Disk usage | Log rotation limits |

## Limitations
- The app relies on cloudflared for network security properties and Access enforcement.
- Checksums are only as strong as the availability of checksum metadata.
- The app does not validate remote policy configuration in Cloudflare.

## Future work
- More detailed diagnostics and guided troubleshooting.
- Optional policy validation (read-only) where feasible.
- Additional localization and accessibility improvements.

## Glossary
- Cloudflared: The local binary that connects to Cloudflare and establishes the tunnel.
- Access: Cloudflare Access policies that gate access to protected services.
- Bind address: Local IP/port the server listens on.
