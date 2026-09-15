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
src/core/       编码检测、章节解析、进度存储（纯逻辑，单测覆盖）
src/App.vue     v2 骨架占位，界面在 A2 / B4 / C1 中逐个实现
tests/unit/     核心逻辑单测
samples/        手测用样例小说
```

## 环境注意事项（本机实测，别踩回头路）

- `package.json` 的 `overrides` 把 `rollup` 换成 `@rollup/wasm-node`：本机应用控制策略会拦截 rollup 原生绑定 DLL，改回原生会让 `vitest` / `vite build` 直接失败。
- `npm test` / `npm run build` 会拉起 esbuild 子进程，沙箱内可能报 `EPERM`，需在沙箱外执行。
- 首次安装依赖若走不通，用 npmmirror 镜像（本机 npm registry 已配置）。
