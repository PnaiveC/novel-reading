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

## 打包为 Windows exe

```bash
npm run pack:win
```

产物为单文件 `release/novel-reading-demo.exe`（portable 版，免安装）。

注意事项：

- 打包前请先停止 `npm run dev` 开发服务器：Windows 下 Vite 的文件监听会
  锁住 `release` 目录，导致打包的解压重命名步骤失败（EPERM）。
- 国内网络环境下，Electron 二进制可能下载失败，可在打包前设置镜像：
  ```powershell
  $env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
  $env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'
  ```

## 环境注意（Windows 应用控制策略）

当前开发机的 Windows 应用控制策略会拦截 Node 加载 rollup 的原生绑定 DLL，
导致 `vitest` / `vite build` 直接失败。为兼容该环境，`package.json` 通过
`overrides` 将 `rollup` 整体替换为官方 WASM 实现 `@rollup/wasm-node`
（版本与 rollup 保持一致）。若在其他无此限制的机器上开发，可移除该
`overrides` 以恢复原生性能。
