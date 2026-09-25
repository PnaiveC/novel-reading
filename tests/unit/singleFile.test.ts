import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { OutputBundle } from 'rollup'
import { describe, expect, it } from 'vitest'
import {
  DELIVERY_FILE,
  deliveryFilePlugin,
  findExternalRefs,
  inlineSingleFile,
  singleFilePlugin,
} from '../../build/single-file'
import { readStamp, sourceStamp, stampHtml } from '../../build/source-stamp'

const HTML = `<!doctype html>
<html><head>
  <link rel="stylesheet" crossorigin href="./assets/style-abc.css">
  <link rel="modulepreload" crossorigin href="./assets/index-abc.js">
</head><body>
  <div id="app"></div>
  <script type="module" crossorigin src="./assets/index-abc.js"></script>
</body></html>`

describe('inlineSingleFile', () => {
  it('JS / CSS 内联，外部引用清零', () => {
    const html = inlineSingleFile(HTML, [
      { fileName: 'assets/index-abc.js', content: 'console.log(1)', kind: 'js' },
      { fileName: 'assets/style-abc.css', content: 'body{color:red}', kind: 'css' },
    ])
    expect(html).toContain('<script>\nconsole.log(1)\n</script>')
    expect(html).toContain('<style>\nbody{color:red}\n</style>')
    expect(html).not.toContain('type="module"')
    expect(findExternalRefs(html)).toEqual([])
  })

  it('脚本落在 </body> 前，保证 #app 已就位才执行', () => {
    const html = inlineSingleFile(HTML, [
      { fileName: 'assets/index-abc.js', content: 'boot()', kind: 'js' },
    ])
    expect(html.indexOf('boot()')).toBeGreaterThan(html.indexOf('<div id="app">'))
    expect(html.indexOf('boot()')).toBeLessThan(html.indexOf('</body>'))
  })

  it('脚本内容里的 </script> 不会提前收尾', () => {
    const html = inlineSingleFile(HTML, [
      { fileName: 'assets/index-abc.js', content: 'const s = "</script>"', kind: 'js' },
    ])
    expect(html).toContain('<\\/script>')
  })

  it('脚本里的 $& / $` / $\' 原样保留（字符串替换会吃掉它们）', () => {
    const js = 'const t = `$&` + "$`" + "$\'";keep()'
    const html = inlineSingleFile(HTML, [{ fileName: 'assets/index-abc.js', content: js, kind: 'js' }])
    expect(html).toContain(js)
    expect(html.indexOf('keep()')).toBeLessThan(html.indexOf('</body>'))
  })

  it('认得出没清干净的外部引用', () => {
    expect(findExternalRefs('<script src="./still-there.js"></script>')).toEqual(['./still-there.js'])
  })
})

describe('singleFilePlugin', () => {
  it('内联 chunk（入口代码）与 asset（样式），产物只留 HTML', () => {
    const bundle = {
      'index.html': { type: 'asset', fileName: 'index.html', source: HTML },
      'assets/index-abc.js': { type: 'chunk', fileName: 'assets/index-abc.js', code: 'console.log(1)' },
      'assets/style-abc.css': {
        type: 'asset',
        fileName: 'assets/style-abc.css',
        source: 'body{color:red}',
      },
    } as unknown as OutputBundle

    const plugin = singleFilePlugin()
    const warn = () => undefined
    ;(plugin.generateBundle as (this: unknown, options: unknown, bundle: OutputBundle) => void).call(
      { warn },
      {},
      bundle,
    )

    const html = String((bundle['index.html'] as { source: string }).source)
    expect(Object.keys(bundle)).toEqual(['index.html'])
    expect(html).toContain('console.log(1)')
    expect(html).toContain('body{color:red}')
    expect(findExternalRefs(html)).toEqual([])
  })

  it('入口在 src/ 下时，产物名字对齐成根目录那份交付文件', () => {
    const bundle = {
      'src/index.html': { type: 'asset', fileName: 'src/index.html', source: HTML },
      'assets/index-abc.js': { type: 'chunk', fileName: 'assets/index-abc.js', code: 'boot()' },
      'assets/style-abc.css': {
        type: 'asset',
        fileName: 'assets/style-abc.css',
        source: 'body{color:red}',
      },
    } as unknown as OutputBundle

    const plugin = singleFilePlugin()
    ;(plugin.generateBundle as (this: unknown, options: unknown, bundle: OutputBundle) => void).call(
      { warn: () => undefined },
      {},
      bundle,
    )

    expect(Object.keys(bundle)).toEqual([DELIVERY_FILE])
    const html = String((bundle[DELIVERY_FILE] as { source: string }).source)
    expect(html).toContain('boot()')
    expect(html).toContain('body{color:red}')
    // 产物带着源码指纹：交付文件落后没落后，测试一比就知道（N3）
    expect(readStamp(html)).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('源码指纹（N3）', () => {
  it('源码没变指纹一致；改一个文件就变', () => {
    const dir = mkdtempSync(join(tmpdir(), 'source-stamp-'))
    try {
      mkdirSync(join(dir, 'src'), { recursive: true })
      writeFileSync(join(dir, 'src', 'a.ts'), 'const a = 1\n')
      const first = sourceStamp(dir)
      expect(sourceStamp(dir)).toBe(first)

      writeFileSync(join(dir, 'src', 'a.ts'), 'const a = 2\n')
      const second = sourceStamp(dir)
      expect(second).not.toBe(first)

      writeFileSync(join(dir, 'src', 'b.ts'), 'const b = 1\n')
      expect(sourceStamp(dir)).not.toBe(second)
    } finally {
      if (dir.startsWith(tmpdir())) rmSync(dir, { recursive: true, force: true })
    }
  })

  it('能写进产物 HTML，也能读回来', () => {
    const stamped = stampHtml('<!doctype html><html><head></head><body></body></html>', 'abc123')
    expect(stamped).toContain('<head>\n    <!-- novel-reading build abc123 -->')
    expect(readStamp(stamped)).toBe('abc123')
    expect(readStamp('<html><head></head></html>')).toBeNull()
  })
})

const entryHtml = join(process.cwd(), 'src', 'index.html')

describe('构建入口', () => {
  it('源码入口在 src/index.html：根目录那份是产物，不能拿来当入口', () => {
    // 踩过的坑：把构建产物挪到根目录当入口后，产物里的内联脚本会被当成模板照抄，
    // 源码再也进不去产物（`npm run build` 变成空跑）。
    const html = readFileSync(entryHtml, 'utf8')
    expect(html).toContain('<div id="app">')
    expect(html).toContain('type="module"')
    expect(html).toContain('/src/main.ts')
    expect(html).not.toContain('@vue/shared')
  })

  it('构建不清空 dist/：那里面可能放着用户手测用的文本，只覆盖自己产出的文件', () => {
    // 用读配置文本的方式断言：在 jsdom 环境里 import vite 配置会撞上 TextEncoder 的 realm 问题
    const config = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8')
    expect(config).toContain('emptyOutDir: false')
  })
})

describe('交付文件插件（N3）：抄交付文件是单独一步', () => {
  it('把产物写到指定目标（根目录那份由 npm run build 落）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'delivery-plugin-'))
    try {
      const target = join(dir, 'index.html')
      const plugin = deliveryFilePlugin({ file: target })
      const bundle = {
        'index.html': { type: 'asset', fileName: 'index.html', source: '<html>ok</html>' },
      } as unknown as OutputBundle
      const generate = plugin.generateBundle as (
        this: unknown,
        options: unknown,
        bundle: OutputBundle,
      ) => void
      generate.call({ warn: () => undefined }, {}, bundle)
      ;(plugin.writeBundle as (this: unknown) => void).call({ warn: () => undefined })

      expect(readFileSync(target, 'utf8')).toBe('<html>ok</html>')
    } finally {
      if (dir.startsWith(tmpdir())) rmSync(dir, { recursive: true, force: true })
    }
  })

  it('输出里没有 HTML 时什么都不写', () => {
    const dir = mkdtempSync(join(tmpdir(), 'delivery-plugin-'))
    try {
      const target = join(dir, 'index.html')
      const plugin = deliveryFilePlugin({ file: target })
      const generate = plugin.generateBundle as (
        this: unknown,
        options: unknown,
        bundle: OutputBundle,
      ) => void
      generate.call({ warn: () => undefined }, {}, {} as OutputBundle)
      ;(plugin.writeBundle as (this: unknown) => void).call({ warn: () => undefined })

      expect(existsSync(target)).toBe(false)
    } finally {
      if (dir.startsWith(tmpdir())) rmSync(dir, { recursive: true, force: true })
    }
  })
})
