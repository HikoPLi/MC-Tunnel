# MC Tunnel UI

Cross-platform desktop UI for running a Cloudflare Access TCP tunnel to a local Minecraft server with strict validation and safety controls.

## Highlights
- Profiles, saved links, and explicit settings (no auto-filled hostname or local bind)
- Port precheck before start to prevent bind failures
- Optional checksum enforcement for cloudflared downloads
- Log rotation with size and backup limits
- Config import/export and OS-native log/config locations

## Table of contents
- Requirements
- Quick start
- Configuration model
- Safety settings
- Cloudflared
- Logs
- Build and release
- Tests and CI
- License
- Intellectual property and trademarks

## Requirements
- Node.js 18+
- npm or pnpm

## Quick start
1) Install packages
   - npm install
2) Run
   - npm run start

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

## CI/CD
- CI runs tests on every PR and push to main/master.
- Release builds run on tags (v*) and build Windows/macOS/Linux artifacts.
- GitHub Actions workflows: .github/workflows/ci.yml and .github/workflows/release.yml

## Tests and CI
- npm test
- GitHub Actions workflow: .github/workflows/ci.yml

## License
MIT License. See LICENSE.

## Intellectual property and trademarks
Copyright (c) 2026 LiYanpei, Hiko.

The source code is licensed under the MIT License. The project name, logos, and branding are not licensed under MIT and remain the exclusive property of their respective owners. No trademark rights are granted. Do not use the name or branding in a way that implies endorsement or affiliation without prior written permission.
