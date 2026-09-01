# novel-reading

小说阅读器 MVP：本地 TXT 电子书阅读。

## 开发

```bash
npm install
npm run dev     # 启动开发服务器
npm test        # 运行测试
npm run build   # 类型检查 + 生产构建
```

详细规划见 [docs/mvp-plan.md](docs/mvp-plan.md)。

## 环境注意（Windows 应用控制策略）

当前开发机的 Windows 应用控制策略会拦截 Node 加载 rollup 的原生绑定 DLL，
导致 `vitest` / `vite build` 直接失败。为兼容该环境，`package.json` 通过
`overrides` 将 `rollup` 整体替换为官方 WASM 实现 `@rollup/wasm-node`
（版本与 rollup 保持一致）。若在其他无此限制的机器上开发，可移除该
`overrides` 以恢复原生性能。
