# MC Tunnel UI 白皮书 / Whitepaper

## 执行摘要 / Executive summary
| 中文 | English |
| --- | --- |
| MC Tunnel UI 是一款跨平台 Electron 应用，用于运行 Cloudflare Access TCP 隧道以连接本地 Minecraft 服务器。它通过强调显式用户意图、预检校验与透明日志来降低误配置与运维风险。本产品不管理 Cloudflare 凭据或服务器配置，专注于安全地编排本地隧道进程。 | MC Tunnel UI is a cross-platform Electron application that helps users run a Cloudflare Access TCP tunnel to a local Minecraft server. It reduces misconfiguration and operational risk through explicit user intent, preflight validation, and transparent logging. The product does not manage Cloudflare credentials or server configuration; it focuses on safe orchestration of the local tunnel process. |

## 受众 / Audience
| 中文 | English |
| --- | --- |
| <ul><li>运行 Minecraft 服务器的管理员与爱好者。</li><li>需要安全默认值与透明行为的用户。</li><li>维护本应用与发布流程的贡献者。</li></ul> | <ul><li>Server administrators and hobbyists who run Minecraft servers.</li><li>Security-conscious users who need safe defaults and transparent behavior.</li><li>Contributors maintaining the application and its release process.</li></ul> |

## 问题陈述 / Problem statement
| 中文 | English |
| --- | --- |
| 运行 TCP 隧道需要谨慎配置与运维纪律，常见失败包括错误的绑定地址、端口冲突与缺乏隧道状态可见性。许多工具优先速度而非安全，导致隐藏默认值与脆弱自动化。本项目旨在提供一个显式、安全、可预测的 UI。 | Running a TCP tunnel requires careful configuration and operational discipline. Common failure modes include incorrect bind addresses, port conflicts, and lack of visibility into tunnel state. Many tools prioritize speed over safety, leading to hidden defaults and fragile automation. This project aims to provide a UI that is explicit, safe, and predictable. |

## 目标 / Goals
| 中文 | English |
| --- | --- |
| <ul><li>使隧道配置显式且易于审计。</li><li>快速失败并提供清晰、可执行的反馈。</li><li>提供防止不安全默认值的护栏。</li><li>在 Windows、macOS 与 Linux 上保持一致与可预测的行为。</li></ul> | <ul><li>Make tunnel configuration explicit and easy to audit.</li><li>Fail fast with clear, actionable feedback.</li><li>Provide guardrails that prevent unsafe defaults.</li><li>Maintain predictable behavior across Windows, macOS, and Linux.</li></ul> |

## 非目标 / Non-goals
| 中文 | English |
| --- | --- |
| <ul><li>管理或存储 Cloudflare 凭据或 Token。</li><li>修改 Minecraft 服务器配置或文件。</li><li>提供自动化的网络发现或后台自动行为。</li></ul> | <ul><li>Manage or store Cloudflare credentials or tokens.</li><li>Modify Minecraft server configuration or files.</li><li>Provide auto-magic network discovery or background automation.</li></ul> |

## 架构概览 / Architecture overview
| 中文 | English |
| --- | --- |
| MC Tunnel UI 是一个本地桌面应用，包含两大组件：<ul><li>Electron 主进程：系统集成、进程控制、文件系统访问。</li><li>渲染进程 UI：配置界面、状态显示与用户交互。</li></ul>应用会基于用户配置档启动并监控本地 cloudflared 进程。 | MC Tunnel UI is a local desktop application with two main components:<ul><li>Electron main process: system integration, process control, filesystem access.</li><li>Renderer UI: configuration UI, status, and user interactions.</li></ul>The application launches and monitors a local cloudflared process based on user-defined profiles. |

## 图示 / Illustrations
### 云服务器示意 / Cloud server illustration (reference)
![Cloud server illustration](docs/images/web/cloud-server.svg)

### 网络拓扑示意 / Network topologies (reference)
![Network topologies](docs/images/web/network-topologies.svg)

## 组件模型 / Component model
| 中文 | English |
| --- | --- |
| <ul><li>配置档管理：保存显式隧道设置（hostname 列表、bind 列表、日志配置、cloudflared 路径）。</li><li>保存链接：保存多 host 输入，便于快速复用。</li><li>连接编排：支持增量启动；已运行连接保持不受影响。</li><li>连接控制列表：每个 hostname + bind 连接可单独 Start/Stop。</li><li>预检：在启动前验证端口可用性与二进制基本健康。</li><li>Cloudflared 管理：优先复用现有可执行文件，必要时下载并在占用场景下侧装。</li><li>日志子系统：采集进程输出、轮转日志并提供日志位置。</li></ul> | <ul><li>Profile manager: stores explicit tunnel settings (hostname list, bind list, log config, cloudflared path).</li><li>Saved links: persist multi-host inputs for quick reuse.</li><li>Connection orchestration: supports incremental starts while existing running connections remain unaffected.</li><li>Connection control list: each hostname + bind connection can be started/stopped independently.</li><li>Preflight checks: verifies port availability and basic binary health before launch.</li><li>Cloudflared management: reuses an existing executable first, and installs a managed binary with side-by-side fallback if the target is busy.</li><li>Logging subsystem: captures process output, rotates logs, and exposes log locations.</li></ul> |

## 数据流（高层） / Data flow (high level)
| 中文 | English |
| --- | --- |
| <ol><li>用户输入一个或多个 hostname；local bind 可显式填写或留空（留空代表允许自动分配）。</li><li>预检校验 cloudflared 与自定义 bind；自动 bind 路径会挑选未占用端口。</li><li>应用按 `hostname + bind` 启动连接，并将新连接追加到运行时列表。</li><li>每条连接在 UI 列表中独立展示与控制（Start/Stop）。</li><li>日志输出到 UI 并落盘保存；全部连接停止后更新全局状态。</li></ol> | <ol><li>User provides one or more hostnames; local bind can be explicit or left blank (blank means auto-allocation is allowed).</li><li>Preflight validates cloudflared and custom binds; auto-bind flow picks an unoccupied port.</li><li>The app starts connections by `hostname + bind` and appends new ones to the runtime list.</li><li>Each connection is shown and controlled independently in the UI list (`Start`/`Stop`).</li><li>Logs are streamed to UI and disk; global status is updated when all connections stop.</li></ol> |

## 安全模型 / Security model
### 资产 / Assets
| 中文 | English |
| --- | --- |
| <ul><li>本地服务器可用性与配置。</li><li>隧道配置（hostname、bind 地址、cloudflared 路径）。</li><li>日志文件（可能包含运维元数据）。</li></ul> | <ul><li>Local server availability and configuration.</li><li>Tunnel configuration (hostname, bind address, cloudflared path).</li><li>Log files, which may contain operational metadata.</li></ul> |

### 信任边界 / Trust boundaries
| 中文 | English |
| --- | --- |
| <ul><li>本地机器与 OS 进程边界。</li><li>由 cloudflared 与 Cloudflare 管理的外部网络边界。</li></ul> | <ul><li>Local machine and OS process boundary.</li><li>External network boundary managed by cloudflared and Cloudflare.</li></ul> |

### 威胁与缓解 / Threats and mitigations
| 中文 | English |
| --- | --- |
| <ul><li>误配置导致暴露：通过显式输入、无隐式 hostname 与无静默回退缓解。</li><li>端口冲突或被占用：通过预检、冲突提示与可确认终止流程缓解。</li><li>重复触发启动导致状态混乱：UI 仅在请求进行中短暂禁用 Start，避免重复请求。</li><li>cloudflared 二进制被篡改：通过可选校验和验证缓解。</li><li>cloudflared 二进制被占用导致更新失败：使用侧装文件名回退，避免更新中断。</li><li>日志泄露敏感信息：避免记录凭据并提醒避免含 Token 的 URL。</li></ul> | <ul><li>Misconfiguration leading to exposure: mitigated by explicit inputs, no implicit hostnames, and no silent fallbacks.</li><li>Port conflicts or hijacking: mitigated by preflight checks, conflict reporting, and confirmed termination flow.</li><li>State confusion from duplicate start triggers: UI only disables Start during in-flight requests to prevent duplicate launches.</li><li>Tampered cloudflared binary: mitigated by optional checksum enforcement.</li><li>cloudflared update failure due to busy binary: mitigated by side-by-side install fallback naming.</li><li>Log leakage of sensitive info: mitigated by avoiding credentials and warning against tokenized URLs.</li></ul> |

## 安全控制 / Safety controls
| 中文 | English |
| --- | --- |
| <ul><li>启动前必须显式配置。</li><li>支持多 Host 增量启动，不覆盖已有运行连接。</li><li>启动前执行端口预检；无自定义 bind 时自动分配空闲端口。</li><li>破坏性操作需确认（结束占用端口的进程）。</li><li>全局 Start 仅在 in-flight 请求期间禁用，避免“已运行即永久禁用”。</li><li>日志轮转与限制，避免磁盘耗尽。</li><li>可选下载校验和强制。</li></ul> | <ul><li>Explicit configuration is required before start.</li><li>Supports incremental multi-host starts without replacing existing running connections.</li><li>Performs preflight checks for explicit binds and auto-allocates a free local port when bind is omitted.</li><li>Destructive actions require confirmation (killing a process on a port).</li><li>Global Start is disabled only during in-flight requests, preventing the “permanently disabled while running” issue.</li><li>Log rotation and limits help avoid disk exhaustion.</li><li>Optional checksum enforcement is available for downloads.</li></ul> |

## 隐私与数据处理 / Privacy and data handling
| 中文 | English |
| --- | --- |
| <ul><li>配置与日志本地存储在系统用户数据目录。</li><li>正常使用不需要遥测或后台网络调用。</li><li>应用不存储 Cloudflare 凭据或认证 Token。</li></ul> | <ul><li>The app stores configuration and logs locally under the OS user data directory.</li><li>No telemetry or background network calls are required for normal use.</li><li>The app does not store Cloudflare credentials or authentication tokens.</li></ul> |

## 运行模型 / Operational model
| 中文 | English |
| --- | --- |
| <ul><li>通过平台打包或开发脚本安装。</li><li>更新通过发布流程与打包产物管理。</li><li>cloudflared 探测优先级：配置路径 > PATH > 托管目录（`userData/bin`）。</li><li>macOS/Windows/Linux 均复用托管 cloudflared，避免每次启动重复下载。</li><li>当目标二进制占用无法覆盖时，采用侧装命名并继续安装。</li><li>用户完全控制全局隧道和单连接启停。</li></ul> | <ul><li>Installation is performed via platform packaging or development scripts.</li><li>Updates are managed via the release process and packaged artifacts.</li><li>cloudflared probe priority is: configured path > PATH > managed directory (`userData/bin`).</li><li>Managed cloudflared binaries are reused across macOS/Windows/Linux launches to avoid repeated downloads.</li><li>If the target binary is busy and cannot be replaced, installation falls back to side-by-side naming.</li><li>The user controls both global tunnel lifecycle and per-connection start/stop.</li></ul> |

## 端到端使用指南 / End-to-end usage guide
本节提供完整、安全的流程：主机侧 Cloudflare 配置与客户端 MC Tunnel UI 设置。

### 前置条件 / Prerequisites
| 中文 | English |
| --- | --- |
| <ul><li>已拥有 Cloudflare 账号与托管在 Cloudflare 的域名（权威 DNS 指向 Cloudflare）。</li><li>主机（服务器）与客户端均已安装 cloudflared。</li><li>主机上有可用的 Minecraft 服务器，并确认其本地端口。</li></ul> | <ul><li>A Cloudflare account and a domain active on Cloudflare (authoritative DNS points to Cloudflare).</li><li>cloudflared installed on both the host (server) and the client.</li><li>A running Minecraft server on the host with a known local port.</li></ul> |

### 步骤 1：主机侧 Cloudflare 配置（服务器拥有者） / Step 1: Host-side Cloudflare setup (server owner)
| 中文 | English |
| --- | --- |
| <ol><li>在 Cloudflare Zero Trust 中为一个 hostname 创建自建应用（示例：mc.example.com）。</li><li>为可连接用户添加 Allow 策略（Access 默认拒绝）。</li><li>在主机上完成 cloudflared 认证并创建 TCP 隧道：<br><code>cloudflared tunnel login</code><br><code>cloudflared tunnel --hostname mc.example.com --url tcp://localhost:PORT</code></li><li>将隧道以服务形式长期运行，确保 hostname 可达。</li></ol> | <ol><li>In Cloudflare Zero Trust, create a self-hosted Access application for a hostname (example: mc.example.com).</li><li>Add an Allow policy for users who should connect (Access is deny-by-default).</li><li>On the host, authenticate cloudflared and create the TCP tunnel:<br><code>cloudflared tunnel login</code><br><code>cloudflared tunnel --hostname mc.example.com --url tcp://localhost:PORT</code></li><li>Keep the tunnel running as a service so the hostname stays reachable.</li></ol> |

### 步骤 2：客户端使用 MC Tunnel UI / Step 2: Client-side setup with MC Tunnel UI
| 中文 | English |
| --- | --- |
| <ol><li>使用 Check 或 Install 确保 cloudflared 可用（优先复用已有路径）。</li><li>创建配置档或保存链接：<ul><li>Hostname：支持多个（逗号/换行分隔）。</li><li>Local bind：可选；可逐项填写，留空项将自动分配可用端口。</li></ul></li><li>点击 Start tunnel；已运行连接不会阻止追加启动其他 host。</li><li>在连接列表中按需逐条 Start/Stop。</li><li>将 Minecraft 客户端指向对应本地 bind 地址。</li></ol> | <ol><li>Use Check or Install to ensure cloudflared is available (existing paths are reused first).</li><li>Create a profile or saved link:<ul><li>Hostname: supports multiple entries (comma/newline separated).</li><li>Local bind: optional; explicit per-entry binds are supported, and blank entries are auto-assigned to available ports.</li></ul></li><li>Click `Start tunnel`; existing running connections do not block appending new hosts.</li><li>Use the connection list to start/stop each entry independently.</li><li>Point Minecraft clients to the corresponding local bind addresses.</li></ol> |

### 界面示意 / UI walkthrough
![Demo 1](demo.png)
![Demo 2](demo2.png)

### Cloudflare Access 使用提示 / Cloudflare Access tips
| 中文 | English |
| --- | --- |
| <ul><li>Access 策略默认拒绝，仅允许你信任的用户或组。</li><li>cloudflared 认证会打开浏览器窗口。若 IdP 会话已存在，可在 Access 设置中启用自动认证以跳过额外提示。</li><li>客户端 cloudflared 使用 WebSockets，长连接可能中断。若需要常驻或自动化场景，优先考虑 Service Auth 或 WARP-to-Tunnel。</li></ul> | <ul><li>Access policies are deny-by-default; explicitly allow only trusted users or groups.</li><li>cloudflared authentication opens a browser window. If the IdP session is already active, enable automatic authentication in Access settings to skip extra prompts.</li><li>Client-side cloudflared uses WebSockets; long-lived connections can drop. For always-on or automated usage, prefer Service Auth or WARP-to-Tunnel.</li></ul> |

### 运行检查 / Operational checks
| 中文 | English |
| --- | --- |
| <ul><li>确保主机与客户端的 cloudflared 能正常访问外网 80/443。</li><li>主机侧隧道必须保持运行，停止会导致客户端不可达。</li><li>显式 bind 使用端口预检；未填 bind 由应用自动分配空闲端口。</li><li>若更新 cloudflared 时提示文件占用，应用会使用侧装文件名完成安装。</li></ul> | <ul><li>Ensure outbound 80/443 is allowed for cloudflared on both host and client.</li><li>Keep the host-side tunnel running; stopping it breaks client access.</li><li>Explicit binds use preflight checks; omitted binds are auto-assigned to free ports.</li><li>If cloudflared update reports a busy file, the app completes install via side-by-side binary naming.</li></ul> |

### 参考命令（示例） / Reference commands (example)
```bash
cloudflared tunnel login
cloudflared tunnel --hostname mc.example.com --url tcp://localhost:25565
cloudflared access tcp --hostname mc.example.com --url localhost:25565
```

## 风险清单（节选） / Risk register (selected)
| 风险 / Risk | 影响 / Impact | 缓解 / Mitigation |
| --- | --- | --- |
| 绑定地址错误<br>Incorrect bind address | 隧道失败或暴露错误服务<br>Tunnel fails or exposes wrong service | 显式输入、预检<br>Explicit inputs, preflight checks |
| 端口已占用<br>Port already in use | 启动失败或卡住<br>Start failure or app hangs | 端口预检、用户确认<br>Port precheck, user prompt |
| 重复触发启动<br>Repeated start trigger | 重复请求与状态混乱<br>Duplicate requests and state confusion | in-flight 期间短暂禁用 Start<br>Disable Start only during in-flight requests |
| 二进制文件被占用<br>Busy binary file | 更新失败<br>Update failure | 侧装命名回退安装<br>Side-by-side fallback naming |
| 二进制被破坏<br>Corrupted binary | 不可预期行为<br>Unexpected behavior | 校验和验证<br>Checksum enforcement |
| 日志过多<br>Excessive logs | 磁盘占用<br>Disk usage | 日志轮转限制<br>Log rotation limits |

## 限制 / Limitations
| 中文 | English |
| --- | --- |
| <ul><li>应用依赖 cloudflared 提供网络安全属性与 Access 执行。</li><li>校验和能力取决于可用的校验元数据。</li><li>应用不校验 Cloudflare 侧的策略配置。</li><li>当运行时已使用某 cloudflared 路径时，切换到不同二进制需要先停止所有连接。</li></ul> | <ul><li>The app relies on cloudflared for network security properties and Access enforcement.</li><li>Checksums are only as strong as the availability of checksum metadata.</li><li>The app does not validate remote policy configuration in Cloudflare.</li><li>If runtime is already using one cloudflared path, switching to a different binary requires stopping all active connections first.</li></ul> |

## 未来工作 / Future work
| 中文 | English |
| --- | --- |
| <ul><li>更细致的诊断与引导式故障排查。</li><li>可选的策略校验（只读）能力。</li><li>更多本地化与可访问性改进。</li></ul> | <ul><li>More detailed diagnostics and guided troubleshooting.</li><li>Optional policy validation (read-only) where feasible.</li><li>Additional localization and accessibility improvements.</li></ul> |

## 术语表 / Glossary
| 术语 / Term | 中文说明 | English description |
| --- | --- | --- |
| Cloudflared | 在本地连接 Cloudflare 并建立隧道的二进制。 | The local binary that connects to Cloudflare and establishes the tunnel. |
| Access | Cloudflare Access 用于保护服务的访问策略。 | Cloudflare Access policies that gate access to protected services. |
| Bind 地址 / Bind address | 本地服务监听的 IP/端口。 | Local IP/port the server listens on. |

## 图像与图标来源 / Image credits
- [Cloud_server.svg](https://commons.wikimedia.org/wiki/File:Cloud_server.svg)（CC0 1.0）：云服务器示意图 / Cloud server illustration.
- [NetworkTopologies.svg](https://commons.wikimedia.org/wiki/File:NetworkTopologies.svg)（Public domain）：网络拓扑示意图 / Network topology illustration.
