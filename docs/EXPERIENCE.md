# EXPERIENCE.md（novel-reading）

> 本文档供后续参与 **novel-reading** 项目的 agent 参考，沉淀已踩过的坑与可优化方向。
> 最近更新：2026-09-17（v2 C 块阅读体验完成，下一步 D 块 / 用户浏览器验收）
> 归属调整：2026-09-11 由容器目录 `ai-power` 的根目录移入本项目 `docs/`；同日 `novel-reading/` 已拆分为独立 git 仓库，本文件随项目一起迁移。

## 1. 项目现状速览（2026-09-15 更新）

- 项目目录：`novel-reading`（独立 git 仓库，放在容器目录 `ai-power` 下）
- 当前版本：**v2（重做版）**；v1 冻结在 tag `v1-mvp`
- 形态：构建成**单个 HTML 文件**，双击用浏览器打开（无 .NET / WebView2 / 安装步骤）
- 技术栈：Vite 6 + Vue 3.5 + TypeScript + Vitest（纯前端，无后端）
- 保留代码：`src/core/`（编码检测 / 章节解析 / 进度存储，纯逻辑、单测覆盖）
- 已删除：C# + WebView2 交付壳、v1 界面组件、`release/`、旧 `dist/`、只服务旧壳的打包测试
- 文档：[`v2-features.md`](v2-features.md) 功能清单（逐个实现与验收）、[`v2-plan.md`](v2-plan.md) 方案与验收标准、[`mvp-plan.md`](mvp-plan.md) v1 需求存档

接手前请先读 `AGENTS.md`、本文件与 `docs/v2-features.md`。

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
| Node 25 全局 localStorage 占位 | jsdom 测试中 `localStorage.getItem is not a function`，且它会盖住 jsdom 的实现 | 统一在 `tests/setup.ts` 换成内存 Storage；`src/core/webStorage.ts` 只认功能齐备（get/set/remove 都是函数）的 Storage，否则走内存兜底 |
| PowerShell 终端中文乱码 | `Get-Content` 输出中文变乱码 | 多为终端编码显示问题，文件本身 UTF-8 正常；用 `node -e` 校验内容而非直接看终端 |
| 传递依赖消失 | 删除 electron/electron-builder 后 `@types/node` 被连带移除，`vue-tsc` 类型检查崩溃 | 关键类型包应显式声明在 devDependencies，不依赖传递依赖 |
| 单文件产物白屏（脚本跑太早） | 内联后 `<script>` 变普通脚本，仍在 `<head>`，执行时 `<div id="app">` 还没解析出来 | 内联时把脚本统一挪到 `</body>` 前（`type="module"` 的 defer 语义没了，得自己补位） |
| 内联脚本被 `$&` / `` $` `` / `$'` 吃坏 | 用字符串做 `String.replace` 的替换值时，脚本里的这些字符会被当成占位符展开，产物里混进半截 HTML，报 `SyntaxError: Unexpected token '<'` | 替换值一律用函数 `() => text`；`tests/unit/singleFile.test.ts` 有对应用例 |
| `file://` 下浏览器拒用 IndexedDB | A3「记住上次这本书」直接失效 | `src/core/library.ts` 自动退回 localStorage；配额满时只提示「下次需重选文件」，不阻断本次阅读 |

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

1. 在 `novel-reading/` 下执行 `git log --oneline -5` 看最近提交；需要 v1 的壳或界面时用 `git show v1-mvp:<路径>`
2. 运行 `npm test` 确认基线全绿（沙箱内会 `spawn EPERM`，需在沙箱外执行）
3. `npm run dev` 起开发服务器手工体验
4. 按 `docs/v2-features.md` 的顺序做当前功能项：实现 → 自测 → 用户在浏览器验收 → 提交 → 下一项
5. 遵守协作纪律：小步提交、每次改动带测试、敏感信息不入库、不破坏工作区中未提交的用户改动；容器级约定见 `../../AGENTS.md`

## 6. v2 环境准备记录（2026-09-15）

动机：v1 的问题集中在交付链——单文件 exe 每次启动解压到临时目录，壳再「取最近修改的 dist」，2026-09-15 21:01 启动仍失败（日志 `NavigationCompleted success=False error=ConnectionAborted`）。修这条链路的收益低于重做，故重开 v2。

本次清理：

- v1 打 tag `v1-mvp` 存档，C# 壳与旧界面都能取回
- 删除 `desktop/`（壳源码 + bin/obj）、`release/`（旧 exe 与 WebView2 用户数据）、`dist/`、空的 `electron/`
- 删除 v1 界面 `src/App.vue` 与 `src/components/`，换成最小骨架占位
- 删除只服务旧壳的 `tests/unit/packaging.test.ts`；`package.json` 去掉 `pack:win`，版本升到 0.2.0
- 保留 `src/core/` 与对应单测；保留 `rollup → @rollup/wasm-node` 的 override（本机应用控制策略拦原生 DLL，改回必崩）

基线验证：`npm test` 14 项通过、`npm run build` 成功（两者都需在沙箱外执行）。

## 7. A 块（地基）交付记录 — 2026-09-15

一次做完 A1–A4，没有按 A1→A2→A3→A4 切四刀：这四件事共用同一条链路（打开文件 → 存本机 → 记进度 → 恢复），拆开提交反而要反复改同一批文件。

- A1 单文件产物：`build/single-file.ts` 把入口 chunk 与 CSS 内联，删掉 `script src` / `link href` / `modulepreload`，产物只剩 `dist/index.html`；若仍存在外部引用直接让构建失败。
- A2 打开 TXT：窗口任意位置拖拽 + 「选择文件」两种入口；编码自动识别后立即上屏。
- A3 记住上次这本书：正文连同名字、编码、时间一起存本机；启动时自动回到这本书。
- A4 进度记忆：`章节下标 + 段落下标`（`src/core/anchor.ts` 从视口坐标挑锚点），滚动时节流写入，恢复时把锚点段落顶到视口顶部，误差小于一屏。

顺手做掉的两件前置事：进度键从「文件名 + 大小」换成内容哈希（v1 老进度自动搬家），阅读页给了最小的上一章 / 下一章（否则没法走到书中段去验收 A4；键盘快捷键仍按 B5 再做）。

下一步：B 块（读取核心），从 B1（编码识别与手动切换）开始。

## 8. B 块（读取核心）交付记录 — 2026-09-15

一次做完 B1–B6：六项共用「解码 → 切章 → 上屏 → 记位置」这条链路，拆开提交要反复改同一批文件。

| 项 | 落点 | 关键决定 |
| --- | --- | --- |
| B1 编码 | `core/encoding.ts`（GB18030 识别、乱码自检）、`core/library.ts`（原始字节随书存）、`SettingsPanel` 的编码下拉 | 手动切编码要靠**原始字节**重新解码，A 块只存了解码后的文本，这次补上；手动选过就记住（`encodingLocked`），下次打开不再被自动识别顶掉 |
| B2 章节解析 | `core/chapterParser.ts` | 加了 `Chapter 1`、`卷一 / 第3卷`；标题行限长 40 字且不许有句末标点，挡住「第一章的内容是……」这类正文；**完全认不出标题时按 4000 字分节**（`第 N 节`），不再只给一章「全文」 |
| B3 目录 | `src/components/TocPanel.vue` | 当前章高亮、点击跳转、打开时把当前章滚进视野、Esc 收起 |
| B4 排版 | `core/settings.ts` + `SettingsPanel` + CSS 变量 | 字号 / 行距 / 页宽 / 段间距 / 缩进 / 字体六项，改动即时生效并落盘（顺带把 C3「设置持久化」做掉了） |
| B5 导航 | `App.vue` 的 keydown | `←/→` 翻章、`空格/PageDown` 翻页（0.9 屏）、`PageUp` 回翻、`Home/End` 本章首末、`Esc` 收面板；输入框 / 下拉框聚焦时不抢键 |
| B6 位置提示 | `core/position.ts` | 百分比按**字符量**算，不按章节数；章内进度取段落锚点位置（第一段 0%、最后一段 100%） |

本块新增的坑与结论：

- **GB18030 误判**：`GBK 尾字节(0x81–0xFE) + ASCII 数字` 和 GB18030 的四字节开头长得一样。不按 GBK 双字节配对对齐就会把普通 GBK 小说判成 GB18030（1.6MB 真小说实测踩到）。修法见 `hasGb18030Quad`，回归用例见 `tests/unit/encoding.test.ts`。
- **手动切编码必须有原始字节**：结论是「文本 + 字节」都存，字节走 IndexedDB 结构化克隆；localStorage 兜底用 base64（`core/base64.ts`，手写不用 `btoa`，Node / 浏览器行为一致）。字节存不下时**退一步只存正文**，至少保住「记住上次这本书」。
- **切编码时位置会重排**：换错编码后章节数会变，硬套旧下标会跳到奇怪的位置。做法是记住用户真实待过的位置（`anchorMemory`），每次重解码都按它还原并夹住范围，用户不动就不覆盖。
- **百分比别用 (下标+1)/总数**：只有一段的章节会直接跳到 100%。改成「首段 0%、末段 100%」，长章中间才准。
- **真样本验证**：`samples/demo.txt` 与它的 GBK 版逐字对拍；2MB 真小说 238 章、43ms 解析（`tests/unit/realSamples.test.ts`，2MB 大文件不入库、缺文件自动跳过）；1.6MB GBK 版整本实测「识别为 GBK、238 章、13ms」。产物层直接在 jsdom 里空跑 `dist/index.html`：塞进本机缓存 → 进正文 → 开目录（`tests/unit/distBoot.test.ts`）。

验证：`npm run build`（vue-tsc + 单文件产物 93KB）与 `npm test`（16 个文件、111 项）全绿。

## 9. C 块（阅读体验）交付记录 — 2026-09-17

一次做完 C1 / C2 / C3 / C4 / C5 / C7（清单里没有 C6 号，按「本来就没有」处理）。这六项共用同一套界面骨架（顶栏 + 面板 + 快捷键分发），拆开提交要反复改同一个 App.vue。

| 项 | 落点 | 关键决定 |
| --- | --- | --- |
| C1 主题 | `core/theme.ts` + App.vue 的 CSS 变量 + `SettingsPanel` 的主题下拉 | 四档：日间 / 护眼（纸色）/ 夜间 / 跟随系统；色值全落在 `html[data-theme]` 的变量上，目录、面板、按钮一起换；`t` 键循环。跟随系统用 `matchMedia`，拿不到（jsdom / 老浏览器）当浅色 |
| C2 沉浸模式 | App.vue 的 `.immersive` 样式 + 鼠标靠边探测，偏好存 `core/uiPrefs.ts` | 顶栏 / 状态栏在沉浸下 `position: fixed` + translate 滑走，**不占布局**（否则一显一隐正文会跳）；鼠标进顶部 64px / 底部 56px 才露；开着目录 / 排版面板时工具栏回到正常流（`.pinned`），免得盖住面板；F11 交给浏览器自带，不拦截 |
| C3 快捷键 | `core/shortcuts.ts` + `composables/useShortcuts.ts` + `ShortcutPanel` | 13 个功能各有默认键（目录 d、排版 w、加书签 a、书签列表 b、最近 r、主题 t、沉浸 m + B 块那套翻章翻页键），一个功能可挂多个键（空格 / PageDown 都往下翻）；改键是「点改 → 按新键」的录制式，撞键直接拒绝并说出占用者；存 localStorage，坏数据自动退回默认 |
| C4 连续阅读 | `core/continuous.ts`（纯计算）+ App.vue 的窗口渲染 | 一根滚动条连着放几章：窗口 = 当前章前 3 章到后 2 章，往后读只补后面（**上面不动 → 滚动条不跳**），往回读补前面、超过 12 章裁掉上面老章节，补 / 裁都用 `scrollTop` 补偿保持视线不动；位置改由滚动反推（视口顶部第一个可见段落），`setPosition` 静默同步（不重新落位），跳章 / 点书签才走 `jumpTo` → revision → 重新落位 |
| C5 最近打开 | `core/library.ts` 的 `listBooks` / `removeBook` + `RecentPanel` | IndexedDB 用游标只取目录信息（不把整本书读进内存），localStorage 兜底按 key 前缀扫；列表显示书名、`第 x/y 章 · 全书 z%`、上次时间（今天给时分 / 昨天 / 日期）；进度条信息顺手写进 `ReadingProgress.chapterCount` / `percent`，列表不用再翻整本书；删除连进度与书签一起清，删的正好是当前这本也不打断本次阅读（只是下次要重选文件） |
| C7 书签 | `core/bookmarks.ts` + `BookmarkPanel` | 书签 id 就是「章:段」，同一处重复加只更新时间；列表按阅读顺序排，点一条跳过去；按书存（`novel-reading:bookmarks:<书号>`），换书不串 |

本块新增的坑与结论：

- **窗口渲染必须双向**：只往后补窗口看着挺好，但用户往回滚会撞到「窗口头」卡住。补前面要 `scrollTop += 新增高度`，裁后面上面要 `scrollTop -= 减少高度`，才能做到「滚动条不跳、正文不动」。
- **滚动反推位置和跳章落位要分开**：滚动同步位置时如果也走「重新落位」，用户每滚一帧都会被拽回去。做法是 `setPosition`（静默改状态 + 存盘）与 `jumpTo`（改状态 + revision++，界面重新落位）两条路。
- **沉浸模式不能用 `display: none`**：一显一隐会让正文上下跳。固定定位 + transform 滑走，布局不动。
- **改键录制要抢在全局键盘处理前面**：录制监听挂 `window` 的捕获阶段并 `stopPropagation`，否则「按 w 改键」会顺手把排版面板开起来（单测里从 `document.body` 派发按键，才能走「window 捕获 → body」这条路）。
- **测试里的书号必须是内容哈希**：`loadBookFromBytes` 的 id 由字节算出来，测试里随手写的 `id: 'hash-a'` 会让进度 / 书签对不上，最近列表显示「还没读过」。

验证：`npm run build`（vue-tsc + 单文件产物 123 KB）与 `npm test`（21 个文件、150 项）全绿；产物 121637 字符全部内联。

下一步：用户浏览器验收 C 块 → D 块（D1 文件夹导入 / D2 书架 / D3 全文搜索 / D4 备份恢复 / D5 自动阅读，按需）。
