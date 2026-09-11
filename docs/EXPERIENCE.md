# EXPERIENCE.md（novel-reading）

> 本文档供后续参与 **novel-reading** 项目的 agent 参考，沉淀已踩过的坑与可优化方向。
> 最近更新：2026-09-01（MVP：TXT 小说阅读器）
> 归属调整：2026-09-11 由容器目录 `ai-power` 的根目录移入本项目 `docs/`；同日 `novel-reading/` 已拆分为独立 git 仓库，本文件随项目一起迁移。

## 1. 项目现状速览

- 项目目录：`novel-reading`（独立 git 仓库，放在容器目录 `ai-power` 下）
- MVP 目标：本地 TXT 阅读闭环（打开文件 → 阅读 → 记住进度）
- 技术栈：
  - Web 应用：Vite 6 + Vue 3.5 + TypeScript + Vitest（纯前端，无后端）
  - 桌面壳：C# WinForms + WebView2（.NET 10，framework-dependent 单文件，约 2MB）
- 测试：15 个单元测试（编码检测 / 章节解析 / 进度存储 / 冒烟 / 打包产物）
- 打包命令：`npm run pack:win`，产物 `novel-reading/release/novel-reading-demo.exe`
- 规划文档：[novel-reading/docs/mvp-plan.md](novel-reading/docs/mvp-plan.md)

接手前请先读 `AGENTS.md` 与本文件，再读 `docs/mvp-plan.md`。

## 2. 环境与工具链注意事项（重要，均为实际踩过的坑）

| 问题 | 现象 | 解决方案 |
| --- | --- | --- |
| Windows 应用控制策略拦截原生 DLL | `vitest` / `vite build` 加载 rollup 原生绑定时报 `ERR_DLOPEN_FAILED` | package.json `overrides` 将 `rollup` 替换为 `@rollup/wasm-node`（版本与 rollup 一致）；不要改回原生 |
| 沙箱拦截原生子进程 | `npm test` / `npm run build` 中 esbuild 启动报 `EPERM` | 这些命令需在沙箱外（escalated）执行；独立 exe（esbuild.exe）可直接运行 |
| `.git` 目录只读 | 沙箱内 `git add/commit` 报 `index.lock: Permission denied` | git 写操作需在沙箱外执行 |
| GitHub 直连不稳定 | Electron / 工具链二进制下载失败 | 国内网络优先使用 npmmirror 镜像；本机 `npm` 已配置 npmmirror registry |
| Vite dev server 锁目录 | 打包时 electron-builder/dotnet publish 对 `release` 目录重命名失败（EPERM） | 打包前必须先停止 `npm run dev`（Vite 文件监听会握住目录句柄） |
| .NET 单文件发布 CLI 开关失效 | `--self-contained false` 被忽略，产物莫名 116MB | 必须用属性写法 `-p:SelfContained=false`；嵌入全部内容加 `-p:IncludeAllContentForSelfExtract=true` |
| WebView2 加载本地页面空白 | `file://` 打开 Vite 产物时 ES module 被 Chromium 拦截，窗口白屏 | 用 `SetVirtualHostNameToFolderMapping` 把 dist 映射到 `https://appassets.local` 再导航 |
| Node 25 全局 localStorage 占位 | jsdom 测试中 `localStorage.getItem is not a function` | 存储模块优先用 `window.localStorage`，并做内存 Map 兜底（见 `src/core/storage.ts`） |
| PowerShell 终端中文乱码 | `Get-Content` 输出中文变乱码 | 多为终端编码显示问题，文件本身 UTF-8 正常；用 `node -e` 校验内容而非直接看终端 |
| 传递依赖消失 | 删除 electron/electron-builder 后 `@types/node` 被连带移除，`vue-tsc` 类型检查崩溃 | 关键类型包应显式声明在 devDependencies，不依赖传递依赖 |

## 3. MVP 开发经验总结

1. **范围裁剪是 MVP 的第一生产力**：用户主动砍掉大文件专项优化和全文搜索后，核心闭环更快跑通。后续功能按"是否影响'打开→阅读→进度'闭环"来排优先级。
2. **核心逻辑与 UI 分离**：编码检测、章节解析、存储都是纯 TS 模块，无 UI 依赖，单测写起来非常快（15 个测试大部分是纯逻辑）。
3. **打包类任务先探测工具链再定方案**：本机有 .NET 10 SDK 而无 Rust，最终选 C# + WebView2 而非 Tauri；先跑 `cargo --version` / `dotnet --version` 这类只读探测，避免方案落地到一半才发现缺工具链。
4. **体积教训**：Electron 打包 101MB → 换 C# + WebView2 后 2.1MB。选择壳之前先想清楚"浏览器内核由谁提供"（自带的 Chromium vs 系统 WebView2）。
5. **空白页教训**：桌面壳加载本地 Web 应用不能直接 `file://`（ES module CORS 限制）。给壳加一行诊断日志（`%TEMP%\novel-reading-demo.log`）让"页面是否真的加载成功"可观测，问题定位从盲猜变成看日志。
6. **依赖显式化**：移除大依赖时检查其传递依赖是否被其他代码直接使用（`@types/node` 教训），并在 README/EXPERIENCE 中记录。
7. **小步提交 + 测试兜底**：核心解析、UI、打包各一个提交；每次改动跑全量测试（`npm test`）与构建（`npm run build`），回归成本很低。

## 4. 可优化方向

### 工程与发布
- 接入 CI（如 GitHub Actions）：push 时跑 `npm test` + `npm run build` + `npm run pack:win`，避免环境坑只在本地踩
- 增加组件级单测（FileDrop / TocPanel / SettingsPanel）与基础 E2E
- 为 exe 添加应用图标、版本号与代码签名（当前用默认 Electron 风格图标/无签名）
- 产物目录 `release/` 已 gitignore，发布前可考虑打包 zip 或安装包

### 技术选型
- 若希望"免 .NET 运行时"的分发，可评估 Tauri 2（需先装 Rust 工具链，exe 更小）或 .NET NativeAOT（无运行时依赖，构建复杂度更高）
- WebView2 用户数据目录当前为默认位置，可显式指定以隔离多环境

### 产品功能（V1+）
- 阅读进度细化：目前记录到"章节级"，可扩展到章节内段落偏移
- 章节解析增强：支持"第一卷 第一章"、"第 001 章"等更多标题格式，规则可配置
- 最近打开文件列表（复用现有 `fileKey` 进度存储）
- 分页仿真翻页、全文搜索、书签与批注、TTS 朗读、EPUB/MD 格式支持

### 代码健壮性
- `fileKey` 目前基于"文件名 + 大小"，同名同大小不同内容会串进度；可换内容 hash
- 文件读取失败、编码完全无法识别时的错误提示可更友好（当前有基础提示）
- 大文件（>10MB）目前未做专项优化，若用户反馈卡顿再引入分块解析

## 5. 交接时的开局清单

1. 在项目目录 `novel-reading/` 下执行 `git log --oneline -10`，看最近提交、理解当前进度
2. 运行 `npm test` 确认基线全绿（需沙箱外）
3. `npm run dev` 体验页面（注意：打包前必须先停掉它）
4. 改动涉及 `desktop/NovelReadingDemo/` 时，修改后跑 `npm run pack:win` 验证 exe
5. 遵守协作纪律：小步提交、每次改动带测试、敏感信息不入库、不破坏工作区中未提交的用户改动；容器级约定见 `../../AGENTS.md`
