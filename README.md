# MC Tunnel UI

<p align="center">
  <img src="src/renderer/assets/mc-tunnel_icon.png" width="96" height="96" alt="MC Tunnel UI icon">
</p>

[![CI](https://img.shields.io/github/actions/workflow/status/HikoPLi/MC-Tunnel/ci.yml?label=CI&logo=github)](https://github.com/HikoPLi/MC-Tunnel/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/HikoPLi/MC-Tunnel?logo=github)](https://github.com/HikoPLi/MC-Tunnel/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

MC Tunnel UI 是一个跨平台桌面 UI，用于运行 Cloudflare Access TCP 隧道到本地 Minecraft 服务器，并提供严格的校验与安全控制。应用强调明确用户意图、可预测行为和强操作性护栏。

文档：
- 更新日志： [CHANGELOG](CHANGELOG.md)
- 白皮书： [WHITEPAPER](WHITEPAPER.md)

## 截图
![Demo 1](demo.png)
![Demo 2](demo2.png)

## 一览
- 显式配置的配置档与保存链接（不自动填充 hostname/bind）
- 端口预检防止绑定失败
- 可选 cloudflared 下载校验和校验
- 日志按大小轮转并限制备份数
- 配置导入/导出与系统原生日志/配置目录

## 安全模型
- 应用不会臆造或自动填写网络端点。
- 启动前进行预检以降低运行时失败。
- 破坏性操作（如结束占用端口的进程）必须确认。
- 支持通过校验和强制下载完整性。
- 仅在显式指定配置档时允许自动启动。

## 环境要求
- Node.js 18+
- npm 或 pnpm

## 快速开始（开发）
```bash
npm install
npm run start
```

## 使用流程
1. 创建保存链接（hostname + 本地 bind）或完整配置档（hostname、bind、日志级别/路径、cloudflared 路径）。
2. 使用 Check 验证 cloudflared，或使用 Install 安装与你的 OS/CPU 匹配的最新版本。
3. 点击 Start 启动隧道；应用会在绑定前进行端口预检。

## 与 Cloudflare 的配合方式
- 本应用封装 `cloudflared access tcp --hostname <app-hostname> --url <localBind>` 来建立本地 TCP 监听。
- 该 hostname 必须由 Cloudflare Access 应用保护。
- 源服务需要连接到 Cloudflare（通常通过 Cloudflare Tunnel）。
- 完整的 Cloudflare 配置指南见白皮书。

## 配置模型
- 保存链接仅存 hostname + local bind。
- 配置档包含完整连接设置（hostname、bind、日志级别、日志文件、cloudflared 路径）。
- 自动启动仅使用激活的配置档。
- 配置保存在应用的系统用户数据目录下。

## Cloudflared 管理
- Check 验证现有 cloudflared（路径、权限、可执行性）。
- Install 获取当前 OS/CPU 的最新版本。
- 启用校验和后，若缺少校验数据将拒绝安装。

## 日志与诊断
- 未显式设置时，日志级别使用 cloudflared 默认值。
- 日志默认写入应用用户数据日志目录，可在 UI 中覆盖。
- 可通过 Open log / Open log folder 快速打开。
- 达到大小阈值时轮转日志，并保留固定数量的备份。

## 支持矩阵
| 操作系统 | CPU | 状态 |
| --- | --- | --- |
| macOS 12+ | arm64/x64 | 本地测试通过 |
| Windows 10/11 | x64 | 本地测试通过 |
| Linux (Ubuntu/Debian) | x64/arm64 | 本地测试通过 |
| 其他发行版 | - | 不定期测试 |

## 构建与发布
- 打包：`npm run pack`
- 仅输出目录：`npm run pack:dir`
- 默认不配置代码签名与自动更新，生产发布请自行补充。
- 遵循语义化版本；详见 CHANGELOG。GitHub Releases 提供各平台产物。

## CI/CD
- 本地测试：`npm test`
- CI 在每次 PR 与 main/master 推送时运行。
- Release 在打 tag（v*）时构建并输出 Windows/macOS/Linux 产物。
- GitHub Actions 工作流：`.github/workflows/ci.yml` 与 `.github/workflows/release.yml`。

## 贡献
- 欢迎提交 Issues/PR。请保持 PR 聚焦并说明目的。
- 提交前运行 `npm test`。UI 变更请附 GIF/截图。

## 许可证
MIT License。详见 LICENSE。

## 知识产权与商标
Copyright (c) 2026 LiYanpei, Hiko.

源码遵循 MIT License。项目名称、Logo 与品牌标识不受 MIT 授权，相关权利归各自所有者所有。不授予任何商标权。未经书面许可，不得以暗示背书或关联的方式使用名称或品牌标识。
