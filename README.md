# MC Tunnel UI

[![CI](https://img.shields.io/github/actions/workflow/status/HikoPLi/MC-Tunnel/ci.yml?label=CI&logo=github)](https://github.com/HikoPLi/MC-Tunnel/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/HikoPLi/MC-Tunnel?logo=github)](https://github.com/HikoPLi/MC-Tunnel/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Cross-platform desktop UI for running a Cloudflare Access TCP tunnel to a local Minecraft server with strict validation and safety controls. In 30 seconds: install dependencies, start the app, create a profile, and run a secure tunnel with preflight safety checks.

## Highlights
- Profiles, saved links, and explicit settings (no auto-filled hostname or local bind)
- Port precheck before start to prevent bind failures
- Optional checksum enforcement for cloudflared downloads
- Log rotation with size and backup limits
- Config import/export and OS-native log/config locations

## Table of contents
- Requirements
- Quick start
- Demo
- Support matrix
- Configuration model
- Safety settings
- Cloudflared
- Logs
- Build and release
- Tests and CI
- Contributing
- License
- Intellectual property and trademarks

## Requirements
- Node.js 18+
- npm or pnpm

## Quick start (30 seconds)
```bash
npm install
npm run start
```
1. Add a saved link (hostname + local bind), or create a full profile with log level/path.
2. Run **Check** to verify your cloudflared binary, or **Install** to fetch the latest release.
3. Click **Start** to launch the tunnel; the app prechecks port availability before binding.

## Demo
- Add a short GIF of start/check/install flows (recommend 8–12 seconds, <4 MB).
- If hosting a live panel, link it here (e.g., read-only demo over VNC/recording).

## Support matrix
| OS | CPU | Status |
| --- | --- | --- |
| macOS 12+ | arm64/x64 | ✅ Tested locally |
| Windows 10/11 | x64 | ✅ Tested locally |
| Linux (Ubuntu/Debian) | x64/arm64 | ✅ Tested locally |
| Other distros | - | ⚠️ Not regularly tested |

## Configuration model
- Saved links store hostname + local bind pairs.
- Profiles store full connection settings (hostname, bind, log level, log file, cloudflared path).
- Auto-start uses the active profile.

## Safety settings
- Check port availability before start to avoid bind errors.
- Rotate logs when size exceeds the limit; keep a fixed number of backups.
- Require checksum for cloudflared downloads (recommended).
- Auto-start tunnel on app launch (requires an active profile).

## Cloudflared
- Use Check to validate the binary or Install to fetch the latest release for your OS and CPU.
- If checksum enforcement is enabled, installs fail when a checksum file is missing.

## Logs
- Log level defaults to auto (no explicit loglevel flag; cloudflared uses its default).
- Log file defaults to the app user data logs directory and can be overridden in the UI.
- Use Open log / Open log folder for quick access.

## Build and release
- npm run pack
- Code signing and auto-update are not configured by default; add them for production releases.
- Semantic versioning; see [CHANGELOG](CHANGELOG.md). GitHub Releases include platform artifacts.

## CI/CD
- CI runs tests on every PR and push to main/master.
- Release builds run on tags (v*) and build Windows/macOS/Linux artifacts.
- GitHub Actions workflows: .github/workflows/ci.yml and .github/workflows/release.yml

## Tests and CI
- npm test
- GitHub Actions workflow: .github/workflows/ci.yml

## Contributing
- Issues/PRs welcome. Please open a small, focused PR with a clear description.
- Run `npm test` before submitting. For UI changes, attach a short GIF/screenshot.
- Suggested topics to add on GitHub for discoverability: `minecraft`, `cloudflare-tunnel`, `electron`, `desktop-app`, `server-admin`, `paper`, `spigot`, `docker`, `macos`, `arm64`, `windows`, `linux`.

## License
MIT License. See LICENSE.

## Intellectual property and trademarks
Copyright (c) 2026 LiYanpei, Hiko.

The source code is licensed under the MIT License. The project name, logos, and branding are not licensed under MIT and remain the exclusive property of their respective owners. No trademark rights are granted. Do not use the name or branding in a way that implies endorsement or affiliation without prior written permission.
