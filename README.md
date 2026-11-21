# novel-reading

本地 TXT 小说阅读器，个人自用。当前是 **v2**（重做版）；v1 的界面与 C#/WebView2 交付壳已删除，需要时用 `git show v1-mvp:<路径>` 取回。

## 目标形态

构建成**单个 HTML 文件**，双击用浏览器打开：无 .NET、无 WebView2、无安装步骤，断网可用。

## 开发

```bash
npm install
npm run dev     # 开发服务器（源码入口在 src/index.html）
npm test        # 单元测试
npm run build   # 类型检查 + 生产构建（产出 dist/index.html，并抄成根目录的 index.html）
```

入口与产物的分工（别搞反，否则构建会变成空跑）：

- `src/index.html`：**源码入口**，里面引用 `/src/main.ts`，是 Vite 的入口模板。
- `index.html`：**交付文件**（构建产物），双击即读；由 `npm run build` 自动覆盖更新。
- `dist/index.html`：构建输出目录里的同一份产物（`dist/` 不入库）。

`npm test` 会用真配置在系统临时目录里现建一份产物，跑「自包含 + 冷启动」；再比对**源码指纹**，
检查根目录的交付文件有没有落后——改了源码却没跑 `npm run build`，这一条会红（c1fea72 那次空跑构建就是这么被盯住的）。

## 文档

- [CONTEXT.md](CONTEXT.md)：术语表（书 / 章节 / 段落锚点 / 阅读位置 / 阅读视口 / 章节窗口 / 书库 …）
- [v2-features.md](v2-features.md)：v2 功能清单（A → B → C → D，逐个实现与验收）
- [docs/v2-plan.md](docs/v2-plan.md)：v2 方案（交付形态、里程碑、验收标准）
- [docs/mvp-plan.md](docs/mvp-plan.md)：v1 需求存档
- [docs/EXPERIENCE.md](docs/EXPERIENCE.md)：环境坑与交接要点
- [docs/n1-reading-viewport.md](docs/n1-reading-viewport.md)：N1「把阅读位置收成一个 module」的设计（已实施）
- [docs/n2-book-footprint.md](docs/n2-book-footprint.md)：N2「一本书在本机的足迹收成一个 module」的设计（已实施）
- [docs/n3-delivery-chain.md](docs/n3-delivery-chain.md)：N3「交付链：一个产物，三份身份」的设计（已实施）
- [docs/n4-what-just-happened.md](docs/n4-what-just-happened.md)：N4「刚发生了什么收成一个记账处」的设计（已实施）
- [docs/adr/](docs/adr/)：架构决策记录（滚动补偿规则 / 视口 module 形状 / seam 与测试驱动 / 书库足迹 / 交付链守卫 / 提示与回执）

## 当前目录

```
src/core/        编码检测（UTF-8 / GBK / GB18030 / UTF-16LE）、章节解析、位置百分比、base64（兜底存原始字节）、
                 主题解析、快捷键绑定、书签、全局偏好存储（排版 / 快捷键 / 界面偏好）、
                 刚发生了什么（提示 / 回执两格）、
                 连续阅读的窗口策略与翻页 / 补偿数学（`src/reader/` 的视口调用）、时间显示——纯逻辑；
                 书库（library.ts：一本书在本机的足迹——正文 / 进度 / 书签 / 上次打开）与它的存储后端
                 （backends.ts：IndexedDB 优先，localStorage 兜底，再不行内存）
src/reader/      阅读视口：唯一碰 DOM 的模块，自己测量正文、自己改章节窗口、自己补偿 scrollTop（N1）
src/composables/ useReader：打开书 → 正文上屏 → 记住书 / 位置 / 编码；useSettings：排版设置；
                 useShortcuts：快捷键改键；useUiPrefs：界面偏好（沉浸模式）；useNotices：提示 / 回执
src/components/  TocPanel（目录）、SettingsPanel（排版 / 编码 / 主题）、RecentPanel（最近打开）、
                 BookmarkPanel（书签）、ShortcutPanel（快捷键改键）
src/App.vue      界面：空态（拖拽 / 选文件）、阅读页（连续正文 + 目录 + 上下章 + 快捷键 + 沉浸模式 + 位置提示）
build/           vite 单文件插件（JS/CSS 内联，产物只剩 1 个 HTML）+ 抄交付文件 + 源码指纹
tests/unit/      单测；delivery 会现建一份产物空跑，确认双击能起来、交付文件没落后
samples/         手测用样例小说（demo.txt 与它的 GBK 版 demo-gbk.txt）
```

## 交付

`npm run build` → `dist/index.html` 与根目录 `index.html`（约 126 KB，已内联全部 JS/CSS）。双击根目录那份就能读，
不联网、无安装步骤；产物若还引用外部文件，构建会直接失败。

## 用法

- 打开：把 TXT 拖进窗口，或点「选择文件」；关掉再打开自动回到上次那本书与上次读到的段落
- 连读：读到章末直接往下滚就进下一章，一根滚动条读完全书，不用点按钮
- 目录：左上角「目录」（`d`），点击跳章，Esc 收起；右边缘可以按住拖动改宽度（长章节名看得全）
- 常用键：`d` 目录 · `w` 排版与设置 · `a` 加书签 · `b` 书签列表 · `r` 最近打开 · `t` 换主题 · `m` 沉浸模式；
  `←` / `→` 翻章，`空格` / `PageDown` 翻页，`PageUp` 回翻，`Home` / `End` 到本章首 / 末
- 改键：排版面板 →「快捷键」，点「改」再按新键；撞上别人的键会被拒绝，随时能「恢复默认」
- 主题：日间 / 护眼（纸色）/ 夜间 / 跟随系统，在排版面板里选，`t` 键循环
- 沉浸模式：`m` 只留正文，鼠标靠顶 / 靠底才出工具栏，`Esc` 退出；配合浏览器自带的 `F11` 全屏
- 最近打开：`r` 列出本机读过的书（书名、进度、上次时间），点一本接着读，也能从本机删掉
- 书签：`a` 记住当前段落，`b` 打开书签列表跳回去，书签按书存
- 排版：右上角「排版」调字号、行距、页宽、段间距、缩进、字体、主题；编码也能在这里手动切（切换后阅读位置不变）

## 环境注意事项（本机实测，别踩回头路）

- `package.json` 的 `overrides` 把 `rollup` 换成 `@rollup/wasm-node`：本机应用控制策略会拦截 rollup 原生绑定 DLL，改回原生会让 `vitest` / `vite build` 直接失败。
- `npm test` / `npm run build` 会拉起 esbuild 子进程，沙箱内可能报 `EPERM`，需在沙箱外执行。
- 首次安装依赖若走不通，用 npmmirror 镜像（本机 npm registry 已配置）。
