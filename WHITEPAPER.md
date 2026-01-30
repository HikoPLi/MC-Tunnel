# MC Tunnel UI 白皮书

## 执行摘要
MC Tunnel UI 是一款跨平台 Electron 应用，用于运行 Cloudflare Access TCP 隧道以连接本地 Minecraft 服务器。它通过强调显式用户意图、预检校验与透明日志来降低误配置与运维风险。本产品不管理 Cloudflare 凭据或服务器配置，专注于安全地编排本地隧道进程。

## 受众
- 运行 Minecraft 服务器的管理员与爱好者。
- 需要安全默认值与透明行为的用户。
- 维护本应用与发布流程的贡献者。

## 问题陈述
为本地服务运行 TCP 隧道需要谨慎配置与运维纪律。常见失败包括错误的绑定地址、端口冲突、缺乏隧道状态可见性。许多工具优先速度而非安全，导致隐藏默认值与脆弱自动化。本项目旨在提供一个显式、安全、可预测的 UI。

## 目标
- 使隧道配置显式且易于审计。
- 快速失败并提供清晰、可执行的反馈。
- 提供防止不安全默认值的护栏。
- 在 Windows、macOS 与 Linux 上保持一致与可预测的行为。

## 非目标
- 管理或存储 Cloudflare 凭据或 Token。
- 修改 Minecraft 服务器配置或文件。
- 提供自动化的网络发现或后台自动行为。

## 架构概览
MC Tunnel UI 是一个本地桌面应用，包含两大组件：
- Electron 主进程：系统集成、进程控制、文件系统访问。
- 渲染进程 UI：配置界面、状态显示与用户交互。

应用会基于用户配置档启动并监控本地 cloudflared 进程。

## 组件模型
- 配置档管理：保存显式隧道设置（hostname、bind、日志配置、cloudflared 路径）。
- 保存链接：仅保存 hostname + bind，便于快速使用。
- 预检：在启动前验证端口可用性与二进制基本健康。
- Cloudflared 管理：验证现有二进制或拉取对应 OS/CPU 的版本。
- 日志子系统：采集进程输出、轮转日志并提供日志位置。

## 数据流（高层）
1. 用户选择保存链接或配置档。
2. 预检校验端口可用性与二进制健康。
3. 应用使用显式参数启动 cloudflared。
4. 日志输出到 UI 并落盘保存。
5. 用户停止隧道；日志与状态被更新。

## 安全模型
### 资产
- 本地服务器可用性与配置。
- 隧道配置（hostname、bind 地址、cloudflared 路径）。
- 日志文件（可能包含运维元数据）。

### 信任边界
- 本地机器与 OS 进程边界。
- 由 cloudflared 与 Cloudflare 管理的外部网络边界。

### 威胁与缓解
- 误配置导致暴露：通过显式输入与无自动填充默认值缓解。
- 端口冲突或被占用：通过预检与终止确认缓解。
- cloudflared 二进制被篡改：通过可选校验和验证缓解。
- 日志泄露敏感信息：避免记录凭据并提醒避免含 Token 的 URL。

## 安全控制
- 启动前必须显式配置。
- 启动前执行端口预检。
- 破坏性操作需确认（结束占用端口的进程）。
- 日志轮转与限制，避免磁盘耗尽。
- 可选下载校验和强制。

## 隐私与数据处理
- 配置与日志本地存储在系统用户数据目录。
- 正常使用不需要遥测或后台网络调用。
- 应用不存储 Cloudflare 凭据或认证 Token。

## 运行模型
- 通过平台打包或开发脚本安装。
- 更新通过发布流程与打包产物管理。
- 用户完全控制隧道启停。

## 端到端使用指南（Cloudflare + MC Tunnel UI）
本节提供完整、安全的流程：主机侧 Cloudflare 配置与客户端 MC Tunnel UI 设置。

### 前置条件
- 已拥有 Cloudflare 账号与托管在 Cloudflare 的域名（权威 DNS 指向 Cloudflare）。
- 主机（服务器）与客户端均已安装 cloudflared。
- 主机上有可用的 Minecraft 服务器，并确认其本地端口。

### 步骤 1：主机侧 Cloudflare 配置（服务器拥有者）
1. 在 Cloudflare Zero Trust 中为一个 hostname 创建自建应用（示例：mc.example.com）。
2. 为可连接用户添加 Allow 策略（Access 默认拒绝）。
3. 在主机上完成 cloudflared 认证并创建 TCP 隧道：
   - `cloudflared tunnel login`
   - `cloudflared tunnel --hostname mc.example.com --url tcp://localhost:PORT`
4. 将隧道以服务形式长期运行，确保 hostname 可达。

### 步骤 2：客户端使用 MC Tunnel UI
1. 使用 Check 或 Install 确保 cloudflared 可用。
2. 创建配置档或保存链接：
   - Hostname：Access 应用的 hostname（示例：mc.example.com）。
   - Local bind：本地 TCP 监听地址（示例：127.0.0.1:PORT）。
3. 点击 Start。cloudflared 输出 Access URL 后打开并完成认证。
4. 将 Minecraft 客户端指向本地 bind 地址。

### 界面示意
![Demo 1](demo.png)
![Demo 2](demo2.png)

### Cloudflare Access 使用提示
- Access 策略默认拒绝，仅允许你信任的用户或组。
- cloudflared 认证会打开浏览器窗口。若 IdP 会话已存在，可在 Access 设置中启用自动认证以跳过额外提示。
- 客户端 cloudflared 使用 WebSockets，长连接可能中断。若需要常驻或自动化场景，优先考虑 Service Auth 或 WARP-to-Tunnel。

### 运行检查
- 确保主机与客户端的 cloudflared 能正常访问外网 80/443。
- 主机侧隧道必须保持运行，停止会导致客户端不可达。
- 使用应用的端口预检避免绑定冲突。

### 参考命令（示例）
```bash
cloudflared tunnel login
cloudflared tunnel --hostname mc.example.com --url tcp://localhost:25565
cloudflared access tcp --hostname mc.example.com --url localhost:25565
```

## 风险清单（节选）
| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 绑定地址错误 | 隧道失败或暴露错误服务 | 显式输入、预检 |
| 端口已占用 | 启动失败或卡住 | 端口预检、用户确认 |
| 二进制被破坏 | 不可预期行为 | 校验和验证 |
| 日志过多 | 磁盘占用 | 日志轮转限制 |

## 限制
- 应用依赖 cloudflared 提供网络安全属性与 Access 执行。
- 校验和能力取决于可用的校验元数据。
- 应用不校验 Cloudflare 侧的策略配置。

## 未来工作
- 更细致的诊断与引导式故障排查。
- 可选的策略校验（只读）能力。
- 更多本地化与可访问性改进。

## 术语表
- Cloudflared：在本地连接 Cloudflare 并建立隧道的二进制。
- Access：Cloudflare Access 用于保护服务的访问策略。
- Bind 地址：本地服务监听的 IP/端口。
