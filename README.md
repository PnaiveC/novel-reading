# novel-reading

本地 TXT 小说阅读器，个人自用。当前是 **v2**（重做版）；v1 的界面与 C#/WebView2 交付壳已删除，需要时用 `git show v1-mvp:<路径>` 取回。

## 目标形态

构建成**单个 HTML 文件**，双击用浏览器打开：无 .NET、无 WebView2、无安装步骤，断网可用。

## 开发

```bash
npm install
npm run dev     # 开发服务器
npm test        # 单元测试
npm run build   # 类型检查 + 生产构建
```

## 文档

- [docs/v2-features.md](docs/v2-features.md)：v2 功能清单（A → B → C → D，逐个实现与验收）
- [docs/v2-plan.md](docs/v2-plan.md)：v2 方案（交付形态、里程碑、验收标准）
- [docs/mvp-plan.md](docs/mvp-plan.md)：v1 需求存档
- [docs/EXPERIENCE.md](docs/EXPERIENCE.md)：环境坑与交接要点

## 当前目录

```
src/core/        编码检测、章节解析、书库（IndexedDB + localStorage 兜底）、进度存储（纯逻辑）
src/composables/ useReader：打开书 → 正文上屏 → 记住这本书与读到哪儿
src/App.vue      界面：空态（拖拽 / 选文件）、阅读页（正文 + 上下章 + 位置提示）
build/           vite 单文件插件（JS/CSS 内联，产物只剩 1 个 HTML）
tests/unit/      单测；distBoot 会空跑构建产物，确认双击能起来
samples/         手测用样例小说
```

## 交付

`npm run build` → `dist/index.html`（约 79 KB，已内联全部 JS/CSS）。双击它就能读，
不联网、无安装步骤；产物若还引用外部文件，构建会直接失败。

## 环境注意事项（本机实测，别踩回头路）

- `package.json` 的 `overrides` 把 `rollup` 换成 `@rollup/wasm-node`：本机应用控制策略会拦截 rollup 原生绑定 DLL，改回原生会让 `vitest` / `vite build` 直接失败。
- `npm test` / `npm run build` 会拉起 esbuild 子进程，沙箱内可能报 `EPERM`，需在沙箱外执行。
- 首次安装依赖若走不通，用 npmmirror 镜像（本机 npm registry 已配置）。
