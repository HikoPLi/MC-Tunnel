# MC Tunnel UI

<p align="center">
  <img src="src/renderer/assets/mc-tunnel_icon.png" width="96" height="96" alt="MC Tunnel UI icon">
</p>

[![CI](https://img.shields.io/github/actions/workflow/status/HikoPLi/MC-Tunnel/ci.yml?label=CI&logo=github)](https://github.com/HikoPLi/MC-Tunnel/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/HikoPLi/MC-Tunnel?logo=github)](https://github.com/HikoPLi/MC-Tunnel/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 简介 / Overview
| 中文 | English |
| --- | --- |
| MC Tunnel UI 是一个跨平台桌面 UI，用于运行 Cloudflare Access TCP 隧道到本地 Minecraft 服务器，并提供严格的校验与安全控制。应用强调明确用户意图、可预测行为和强操作性护栏。 | MC Tunnel UI is a cross-platform desktop UI for running a Cloudflare Access TCP tunnel to a local Minecraft server, with strict validation and safety controls. The app emphasizes explicit user intent, predictable behavior, and strong operational guardrails. |

## 文档 / Docs
- 更新日志 / Changelog: [CHANGELOG](CHANGELOG.md)
- 白皮书 / Whitepaper: [WHITEPAPER](WHITEPAPER.md)

## 截图 / Screenshots
![Demo 1](demo.png)
![Demo 2](demo2.png)

## 核心亮点 / Highlights
|  |  |
| --- | --- |
| <img src="docs/images/feather/shield.svg" width="28" height="28" alt="安全"> <br> **安全优先**：不自动填充端点，关键操作需确认<br>**Safety first**: No auto-filled endpoints; destructive actions require confirmation. | <img src="docs/images/feather/check-circle.svg" width="28" height="28" alt="预检"> <br> **预检与验证**：启动前检查端口、cloudflared 可用性<br>**Preflight & validation**: Port checks and cloudflared health before start. |
| <img src="docs/images/feather/sliders.svg" width="28" height="28" alt="显式配置"> <br> **显式配置**：配置档/保存链接一目了然<br>**Explicit config**: Profiles and saved links are clear and auditable. | <img src="docs/images/feather/file-text.svg" width="28" height="28" alt="日志"> <br> **可追踪日志**：日志落盘、轮转与快速定位<br>**Traceable logs**: Persisted logs with rotation and quick access. |

## 工作原理（简图） / How it works (simple)
<p align="center">
  <img src="docs/images/feather/server.svg" width="28" height="28" alt="服务器">
  本地 MC 服务器
  →
  <img src="docs/images/feather/cloud.svg" width="28" height="28" alt="Cloudflare">
  Cloudflare Access
  →
  <img src="docs/images/feather/monitor.svg" width="28" height="28" alt="客户端">
  玩家客户端（本地 bind）
</p>
<p align="center">
  MC Tunnel UI 在客户端启动 cloudflared access tcp，将远端服务映射为本地监听地址。<br>
  MC Tunnel UI runs cloudflared access tcp on the client and maps the remote service to a local listener.
</p>

## 参考图示 / Reference diagrams
### 云服务器示意 / Cloud server illustration (reference)
![Cloud server illustration](docs/images/web/cloud-server.svg)

### 网络拓扑示意 / Network topologies (reference)
![Network topologies](docs/images/web/network-topologies.svg)

## 一览 / At a glance
| 中文 | English |
| --- | --- |
| <ul><li>显式配置的配置档与保存链接（不自动填充 hostname/bind）</li><li>端口预检防止绑定失败</li><li>可选 cloudflared 下载校验和校验</li><li>日志按大小轮转并限制备份数</li><li>配置导入/导出与系统原生日志/配置目录</li></ul> | <ul><li>Explicit profiles and saved links (no auto-filled hostname/bind)</li><li>Preflight port checks to prevent bind failures</li><li>Optional checksum enforcement for cloudflared downloads</li><li>Log rotation with size and backup limits</li><li>Import/export configs and OS-native log/config locations</li></ul> |

## 安全模型 / Safety model
| 中文 | English |
| --- | --- |
| <ul><li>应用不会臆造或自动填写网络端点。</li><li>启动前进行预检以降低运行时失败。</li><li>破坏性操作（如结束占用端口的进程）必须确认。</li><li>支持通过校验和强制下载完整性。</li><li>仅在显式指定配置档时允许自动启动。</li></ul> | <ul><li>The app never invents or auto-fills network endpoints.</li><li>Preflight checks run before tunnel start to reduce runtime failures.</li><li>Potentially destructive actions (killing a process occupying a port) require confirmation.</li><li>Download integrity can be enforced via checksums.</li><li>Auto-start only runs when a profile is explicitly set.</li></ul> |

## 环境要求 / Requirements
| 中文 | English |
| --- | --- |
| <ul><li>Node.js 18+</li><li>npm 或 pnpm</li></ul> | <ul><li>Node.js 18+</li><li>npm or pnpm</li></ul> |

## 快速开始（普通用户） / Quick start (Users)
| 中文 | English |
| --- | --- |
| <ol><li>从 GitHub Releases 下载与你系统匹配的安装包并安装。</li><li>打开应用，填写 Hostname 与 Local bind。</li><li>使用 Check/Install 确保 cloudflared 可用。</li><li>点击 Start，按提示完成 Access 认证，然后让 Minecraft 客户端连接到本地 bind。</li></ol> | <ol><li>Download the installer that matches your OS from GitHub Releases and install it.</li><li>Open the app and fill in Hostname and Local bind.</li><li>Use Check/Install to ensure cloudflared is available.</li><li>Click Start, finish Access authentication, then point your Minecraft client to the local bind.</li></ol> |

## 快速开始（开发） / Quick start (Development)
```bash
npm install
npm run start
```
| 中文 | English |
| --- | --- |
| 运行以上命令以启动开发模式。 | Run the commands above to start in development mode. |

## 使用流程 / Usage workflow
| 中文 | English |
| --- | --- |
| <ol><li>创建保存链接（hostname + 本地 bind）或完整配置档（hostname、bind、日志级别/路径、cloudflared 路径）。</li><li>使用 Check 验证 cloudflared，或使用 Install 安装与你的 OS/CPU 匹配的最新版本。</li><li>点击 Start 启动隧道；应用会在绑定前进行端口预检。</li></ol> | <ol><li>Create a saved link (hostname + local bind) or a full profile (hostname, bind, log level/path, cloudflared path).</li><li>Use Check to validate cloudflared, or Install to fetch the latest release for your OS/CPU.</li><li>Click Start to launch the tunnel; the app prechecks port availability before binding.</li></ol> |

## 与 Cloudflare 的配合方式 / How it fits into Cloudflare
| 中文 | English |
| --- | --- |
| <ul><li>本应用封装 <code>cloudflared access tcp --hostname &lt;app-hostname&gt; --url &lt;localBind&gt;</code> 来建立本地 TCP 监听。</li><li>该 hostname 必须由 Cloudflare Access 应用保护。</li><li>源服务需要连接到 Cloudflare（通常通过 Cloudflare Tunnel）。</li><li>完整的 Cloudflare 配置指南见白皮书。</li></ul> | <ul><li>This app wraps <code>cloudflared access tcp --hostname &lt;app-hostname&gt; --url &lt;localBind&gt;</code> to create a local TCP listener.</li><li>The hostname must be protected by a Cloudflare Access application.</li><li>The origin service should be connected to Cloudflare (typically via Cloudflare Tunnel).</li><li>A full Cloudflare setup guide is in the whitepaper.</li></ul> |

## 配置模型 / Configuration model
| 中文 | English |
| --- | --- |
| <ul><li>保存链接仅存 hostname + local bind。</li><li>配置档包含完整连接设置（hostname、bind、日志级别、日志文件、cloudflared 路径）。</li><li>自动启动仅使用激活的配置档。</li><li>配置保存在应用的系统用户数据目录下。</li></ul> | <ul><li>Saved links store hostname + local bind only.</li><li>Profiles store full connection settings (hostname, bind, log level, log file, cloudflared path).</li><li>Auto-start uses the active profile only.</li><li>Configs are stored under the OS user data directory for the app.</li></ul> |

## Cloudflared 管理 / Cloudflared management
| 中文 | English |
| --- | --- |
| <ul><li>Check 验证现有 cloudflared（路径、权限、可执行性）。</li><li>Install 获取当前 OS/CPU 的最新版本。</li><li>启用校验和后，若缺少校验数据将拒绝安装。</li></ul> | <ul><li>Check validates an existing cloudflared binary (path, permissions, and basic execution).</li><li>Install fetches the latest release for your OS and CPU.</li><li>If checksum enforcement is enabled, installs fail when checksum data is unavailable.</li></ul> |

## 日志与诊断 / Logs & diagnostics
| 中文 | English |
| --- | --- |
| <ul><li>未显式设置时，日志级别使用 cloudflared 默认值。</li><li>日志默认写入应用用户数据日志目录，可在 UI 中覆盖。</li><li>可通过 Open log / Open log folder 快速打开。</li><li>达到大小阈值时轮转日志，并保留固定数量的备份。</li></ul> | <ul><li>If not explicitly set, log level uses cloudflared defaults.</li><li>Log files default to the app user data logs directory and can be overridden in the UI.</li><li>Use Open log / Open log folder for quick access.</li><li>Logs rotate when size exceeds the limit; a fixed number of backups are retained.</li></ul> |

## 支持矩阵 / Support matrix
| 操作系统 / OS | CPU | 状态 / Status |
| --- | --- | --- |
| macOS 12+ | arm64/x64 | 本地测试通过 / Tested locally |
| Windows 10/11 | x64 | 本地测试通过 / Tested locally |
| Linux (Ubuntu/Debian) | x64/arm64 | 本地测试通过 / Tested locally |
| 其他发行版 / Other distros | - | 不定期测试 / Not regularly tested |

## 构建与发布 / Build & release
| 中文 | English |
| --- | --- |
| <ul><li>打包：<code>npm run pack</code></li><li>仅输出目录：<code>npm run pack:dir</code></li><li>默认不配置代码签名与自动更新，生产发布请自行补充。</li><li>遵循语义化版本；详见 CHANGELOG。GitHub Releases 提供各平台产物。</li></ul> | <ul><li>Package: <code>npm run pack</code></li><li>Package directory only: <code>npm run pack:dir</code></li><li>Code signing and auto-update are not configured by default; add them for production releases.</li><li>Semantic versioning; see CHANGELOG. GitHub Releases include platform artifacts.</li></ul> |

## CI/CD
| 中文 | English |
| --- | --- |
| <ul><li>本地测试：<code>npm test</code></li><li>CI 在每次 PR 与 main/master 推送时运行。</li><li>Release 在打 tag（v*）时构建并输出 Windows/macOS/Linux 产物。</li><li>GitHub Actions 工作流：<code>.github/workflows/ci.yml</code> 与 <code>.github/workflows/release.yml</code>。</li></ul> | <ul><li>Local tests: <code>npm test</code></li><li>CI runs tests on every PR and push to main/master.</li><li>Release builds run on tags (v*), producing Windows/macOS/Linux artifacts.</li><li>GitHub Actions workflows: <code>.github/workflows/ci.yml</code> and <code>.github/workflows/release.yml</code>.</li></ul> |

## 贡献 / Contributing
| 中文 | English |
| --- | --- |
| <ul><li>欢迎提交 Issues/PR。请保持 PR 聚焦并说明目的。</li><li>提交前运行 <code>npm test</code>。UI 变更请附 GIF/截图。</li></ul> | <ul><li>Issues/PRs welcome. Keep PRs focused and explain intent.</li><li>Run <code>npm test</code> before submitting. For UI changes, attach a GIF/screenshot.</li></ul> |

## 常见问题 / FAQ
| 中文 | English |
| --- | --- |
| <ul><li><strong>cloudflared 找不到或不可执行</strong>：使用 Check 查看错误提示；必要时用 Install 重新安装。</li><li><strong>端口被占用</strong>：开启端口预检并确认是否允许结束占用进程；或更换本地 bind 端口。</li><li><strong>Access 链接无法通过</strong>：确认浏览器已登录允许的账号，并检查 Access 策略是否放行。</li></ul> | <ul><li><strong>cloudflared not found or not executable</strong>: Use Check to see the error; reinstall via Install if needed.</li><li><strong>Port already in use</strong>: Enable preflight and confirm whether to terminate the occupying process, or pick another local bind port.</li><li><strong>Access link cannot be verified</strong>: Ensure the browser is logged in with an allowed account and the Access policy permits it.</li></ul> |

## 图像与图标来源 / Image credits
- [Feather Icons](https://github.com/feathericons/feather)（MIT License）：核心亮点与简图图标 / Icons for highlights and the simple flow.
- [Cloud_server.svg](https://commons.wikimedia.org/wiki/File:Cloud_server.svg)（CC0 1.0）：云服务器示意图 / Cloud server illustration.
- [NetworkTopologies.svg](https://commons.wikimedia.org/wiki/File:NetworkTopologies.svg)（Public domain）：网络拓扑示意图 / Network topology illustration.

## 许可证 / License
| 中文 | English |
| --- | --- |
| MIT License。详见 LICENSE。 | MIT License. See LICENSE. |

## 知识产权与商标 / IP and trademarks
| 中文 | English |
| --- | --- |
| Copyright (c) 2026 LiYanpei, Hiko。源码遵循 MIT License。项目名称、Logo 与品牌标识不受 MIT 授权，相关权利归各自所有者所有。不授予任何商标权。未经书面许可，不得以暗示背书或关联的方式使用名称或品牌标识。 | Copyright (c) 2026 LiYanpei, Hiko. The source code is licensed under the MIT License. The project name, logos, and branding are not licensed under MIT and remain the exclusive property of their respective owners. No trademark rights are granted. Do not use the name or branding in a way that implies endorsement or affiliation without prior written permission. |
