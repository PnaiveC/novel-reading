import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { OutputBundle } from 'rollup'
import { describe, expect, it } from 'vitest'
import { findExternalRefs, inlineSingleFile, singleFilePlugin } from '../../build/single-file'

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
})

const distHtml = join(process.cwd(), 'dist', 'index.html')

describe('构建产物', () => {
  it.skipIf(!existsSync(distHtml))('dist/index.html 自包含（先跑 npm run build）', () => {
    const html = readFileSync(distHtml, 'utf8')
    expect(findExternalRefs(html)).toEqual([])
    expect(html).toContain('<div id="app">')
  })
})
