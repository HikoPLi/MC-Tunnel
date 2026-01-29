# MC Tunnel UI

Cross-platform desktop UI for running a Cloudflare Access TCP tunnel to a local Minecraft server.

## Features
- Start/stop a tunnel with a saved config
- Save and reuse hostname/local bind pairs from the UI
- Optional auto-install or manual path selection for cloudflared
- Live log output with file persistence
- Works on Windows, macOS, and Linux

## Quick start
1) Install dependencies
   - node >= 18
   - npm or pnpm
2) Install packages
   - npm install
3) Run
   - npm run start

## Build
- npm run pack

## Notes
- The app stores config in the OS user data directory.
- If cloudflared is not found, use the Install button or set a custom path.# MC-Tunnel
