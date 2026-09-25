import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { OutputAsset, OutputBundle } from 'rollup'
import type { Plugin } from 'vite'
import { sourceStamp, stampHtml } from './source-stamp'

export interface InlineAsset {
  fileName: string
  content: string
  kind: 'js' | 'css'
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 把构建出的 JS / CSS 内容塞回 HTML，删掉 <script src> / <link href> /
 * modulepreload。产出的 HTML 不引用任何外部文件，双击（file://）就能跑。
 *
 * 脚本统一挪到 </body> 前：Vite 原本用 type="module"（天然 defer），
 * 内联成普通 script 后会在 <div id="app"> 出现之前执行，直接把界面跑白。
 */
export function inlineSingleFile(html: string, assets: readonly InlineAsset[]): string {
  let out = html
  const scripts: string[] = []
  for (const asset of assets) {
    const name = escapeRe(asset.fileName)
    if (asset.kind === 'js') {
      // 内联脚本里若出现 </script，浏览器会提前收尾，先转义
      const js = asset.content.replace(/<\/script/gi, '<\\/script')
      const tag = new RegExp(`<script\\b[^>]*\\bsrc\\s*=\\s*"[^"]*${name}"[^>]*>\\s*</script>`, 'g')
      if (tag.test(out)) out = out.replace(tag, '')
      scripts.push(js)
    } else {
      out = out.replace(
        new RegExp(`<link\\b[^>]*\\bhref\\s*=\\s*"[^"]*${name}"[^>]*>`, 'g'),
        () => `<style>\n${asset.content}\n</style>`,
      )
    }
  }
  out = out.replace(/<link\b[^>]*\brel\s*=\s*"modulepreload"[^>]*>\s*/g, '')
  if (!scripts.length) return out

  const block = scripts.map((js) => `<script>\n${js}\n</script>`).join('\n')
  // 必须用函数式替换：脚本里会有 $& / $' 之类字符，字符串替换会把它们当占位符展开
  const insert = () => `${block}\n</body>`
  return out.includes('</body>')
    ? out.replace('</body>', insert)
    : `${out}\n${block}\n`
}

/** 产物里仍指向外部文件的引用（正常应为空） */
export function findExternalRefs(html: string): string[] {
  const refs: string[] = []
  const patterns = [
    /<script\b[^>]*\bsrc\s*=\s*"([^"]*)"/gi,
    /<link\b[^>]*\bhref\s*=\s*"([^"]*)"/gi,
    /<img\b[^>]*\bsrc\s*=\s*"([^"]*)"/gi,
  ]
  for (const pattern of patterns) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(html))) {
      const url = match[1]
      if (!url.startsWith('data:') && !url.startsWith('#')) refs.push(url)
    }
  }
  return refs
}

function isHtml(file: OutputAsset): boolean {
  return file.fileName.endsWith('.html')
}

/** 根目录下双击即读的交付文件：构建完顺带抄一份过去，省得再手动复制 */
export const DELIVERY_FILE = 'index.html'

/**
 * 构建产物必须只剩一个自包含 HTML，否则直接失败，不给「白屏」留机会。
 * 这个插件只动构建输出目录里的东西，不碰工作区。
 */
export function singleFilePlugin(): Plugin {
  let root = process.cwd()
  return {
    name: 'novel-reading:single-file',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      root = config.root
    },
    generateBundle(_options, bundle: OutputBundle) {
      const htmlFile = Object.values(bundle).find(
        (file): file is OutputAsset => file.type === 'asset' && isHtml(file),
      )
      if (!htmlFile) throw new Error('[single-file] 构建产物里没有 HTML')

      const assets: InlineAsset[] = []
      for (const file of Object.values(bundle)) {
        if (file === htmlFile) continue
        const kind = file.fileName.endsWith('.js')
          ? 'js'
          : file.fileName.endsWith('.css')
            ? 'css'
            : null
        if (!kind) continue
        // 入口代码是 chunk（file.code），样式等是 asset（file.source）
        const content = file.type === 'asset' ? String(file.source) : file.code
        assets.push({ fileName: file.fileName, content, kind })
        delete bundle[file.fileName]
      }

      const html = inlineSingleFile(String(htmlFile.source), assets)
      const refs = findExternalRefs(html)
      if (refs.length) throw new Error(`[single-file] 产物仍引用外部文件：${refs.join(', ')}`)
      // 盖一个源码指纹：交付文件是不是这份源码构建的，测试一比就知道
      const stamped = stampHtml(html, sourceStamp(root))
      htmlFile.source = stamped
      // 入口在 src/ 下，产物名字对齐成 dist/index.html
      if (htmlFile.fileName !== DELIVERY_FILE) {
        delete bundle[htmlFile.fileName]
        htmlFile.fileName = DELIVERY_FILE
        bundle[DELIVERY_FILE] = htmlFile
      }
      this.warn(`[single-file] 已内联 ${assets.length} 个资源，产物 ${stamped.length} 字符`)
    },
  }
}

/**
 * 交付文件（N3）：构建完把产物抄一份到仓库根目录，双击即读。
 * 单独一个插件是为了让「只要产物、别动工作区」的场景（构建期测试）能跳过它——
 * 根目录那份是 git 跟踪的交付文件，测试不该顺手改它。
 */
export function deliveryFilePlugin(options: { file?: string } = {}): Plugin {
  const target = options.file ?? DELIVERY_FILE
  let built: string | null = null
  return {
    name: 'novel-reading:delivery-file',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const htmlFile = Object.values(bundle).find(
        (file): file is OutputAsset => file.type === 'asset' && isHtml(file),
      )
      built = htmlFile ? String(htmlFile.source) : null
    },
    writeBundle() {
      if (built === null) return
      writeFileSync(resolve(process.cwd(), target), built, 'utf8')
      this.warn(`[single-file] 交付文件已更新：${target}（双击即读）`)
    },
  }
}
