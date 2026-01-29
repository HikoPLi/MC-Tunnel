# MC Tunnel UI

[![CI](https://img.shields.io/github/actions/workflow/status/HikoPLi/MC-Tunnel/ci.yml?label=CI&logo=github)](https://github.com/HikoPLi/MC-Tunnel/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/HikoPLi/MC-Tunnel?logo=github)](https://github.com/HikoPLi/MC-Tunnel/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Cross-platform desktop UI for running a Cloudflare Access TCP tunnel to a local Minecraft server with strict validation and safety controls. The app focuses on explicit user intent, predictable behavior, and strong operational guardrails.

Documentation:
- Changelog: [CHANGELOG](CHANGELOG.md)
- Whitepaper: [WHITEPAPER](WHITEPAPER.md)

## At a glance
- Explicit profiles and saved links (no auto-filled host or bind defaults)
- Preflight port checks to prevent bind failures
- Optional checksum enforcement for cloudflared downloads
- Log rotation with size and backup limits
- Import/export configs and OS-native log/config locations

## Safety model
- The app never invents or auto-fills network endpoints.
- Preflight checks run before tunnel start to reduce runtime failures.
- Potentially destructive actions (killing a process occupying a port) require confirmation.
- Download integrity can be enforced via checksums.
- Auto-start only runs when a profile is explicitly set.

## Requirements
- Node.js 18+
- npm or pnpm

## Quick start (development)
```bash
npm install
npm run start
```

## Usage workflow
1. Create a saved link (hostname + local bind) or a full profile (hostname, bind, log level/path, cloudflared path).
2. Run Check to validate your cloudflared binary, or Install to fetch the latest release for your OS/CPU.
3. Click Start to launch the tunnel; the app prechecks port availability before binding.

## Configuration model
- Saved links store hostname + local bind pairs.
- Profiles store full connection settings (hostname, bind, log level, log file, cloudflared path).
- Auto-start uses the active profile only.
- Configs are stored under the OS user data directory for the app.

## Cloudflared management
- Check validates an existing cloudflared binary (path, permissions, and basic execution).
- Install fetches the latest release for your OS and CPU.
- If checksum enforcement is enabled, installs fail when checksum data is unavailable.

## Logs and diagnostics
- Log level defaults to cloudflared defaults unless explicitly set.
- Log files default to the app user data logs directory and can be overridden in the UI.
- Use Open log / Open log folder for quick access.
- Logs rotate when size exceeds the limit; a fixed number of backups are retained.

## Support matrix
| OS | CPU | Status |
| --- | --- | --- |
| macOS 12+ | arm64/x64 | Tested locally |
| Windows 10/11 | x64 | Tested locally |
| Linux (Ubuntu/Debian) | x64/arm64 | Tested locally |
| Other distros | - | Not regularly tested |

## Build and release
- Package: `npm run pack`
- Package directory only: `npm run pack:dir`
- Code signing and auto-update are not configured by default; add them for production releases.
- Semantic versioning; see CHANGELOG. GitHub Releases include platform artifacts.

## CI/CD
- Local tests: `npm test`
- CI runs tests on every PR and push to main/master.
- Release builds run on tags (v*), producing Windows/macOS/Linux artifacts.
- GitHub Actions workflows: `.github/workflows/ci.yml` and `.github/workflows/release.yml`.

## Contributing
- Issues/PRs welcome. Please open a focused PR with a clear description.
- Run `npm test` before submitting. For UI changes, attach a short GIF/screenshot.

## License
MIT License. See LICENSE.

## Intellectual property and trademarks
Copyright (c) 2026 LiYanpei, Hiko.

The source code is licensed under the MIT License. The project name, logos, and branding are not licensed under MIT and remain the exclusive property of their respective owners. No trademark rights are granted. Do not use the name or branding in a way that implies endorsement or affiliation without prior written permission.
