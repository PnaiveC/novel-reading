# novel-reading

小说阅读器 MVP：本地 TXT 电子书阅读。

## 开发

```bash
npm install
npm run dev     # 启动开发服务器
npm test        # 运行测试
npm run build   # 类型检查 + 生产构建
```

文档：

- [docs/mvp-plan.md](docs/mvp-plan.md)：需求与规划
- [docs/EXPERIENCE.md](docs/EXPERIENCE.md)：开发经验、环境坑、可优化方向与交接清单

## 打包为 Windows exe

```bash
npm run pack:win
```

产物为单文件 `release/novel-reading-demo.exe`（约 2MB，基于系统 WebView2
内核，不内置 Chromium；页面、依赖已全部嵌入 exe）。

注意事项：

- 打包前请先停止 `npm run dev` 开发服务器：Windows 下 Vite 的文件监听会
  锁住 `release` 目录，导致发布步骤失败（EPERM）。
- 构建需要 .NET 10 SDK；当前产物为 framework-dependent 单文件版，运行机器
  需安装 .NET Desktop Runtime 10（本机已装，可直接运行）。
- 运行需要系统 WebView2 运行时（Windows 10/11 通常已预装）。

## 环境注意（Windows 应用控制策略）

当前开发机的 Windows 应用控制策略会拦截 Node 加载 rollup 的原生绑定 DLL，
导致 `vitest` / `vite build` 直接失败。为兼容该环境，`package.json` 通过
`overrides` 将 `rollup` 整体替换为官方 WASM 实现 `@rollup/wasm-node`
（版本与 rollup 保持一致）。若在其他无此限制的机器上开发，可移除该
`overrides` 以恢复原生性能。
