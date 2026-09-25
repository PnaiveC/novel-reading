import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * N3：交付文件的「源码指纹」。
 *
 * 构建时把当前源码的指纹写进产物，测试再算一遍源码指纹跟交付文件里记的那条比对：
 * 对得上，才说明根目录那份确实是这份源码构建出来的。忘了跑 build、或者构建悄悄空跑
 * （c1fea72 那次就是这样：产物被当成入口，构建「成功」但什么都没构建），都会露馅。
 *
 * 用源码内容而不是产物字节：产物字节会随构建环境变（vitest 里 NODE_ENV=test 会打进
 * dev 版 Vue，压缩器的短名分配也未必逐字节一致），那种比对只会假报警。
 */
const SOURCE_DIRS = ['src', 'build']
const SOURCE_FILES = ['vite.config.ts', 'package.json', 'package-lock.json']

export const STAMP_MARKER = 'novel-reading'

function collect(dir: string, files: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) collect(full, files)
    else if (entry.isFile()) files.push(full)
  }
}

/** 源码指纹：每个源码文件的相对路径 + 内容，按路径排序后一起哈希 */
export function sourceStamp(root: string): string {
  const files: string[] = []
  for (const dir of SOURCE_DIRS) {
    const full = join(root, dir)
    if (existsSync(full)) collect(full, files)
  }
  for (const file of SOURCE_FILES) {
    const full = join(root, file)
    if (existsSync(full)) files.push(full)
  }
  files.sort()
  const hash = createHash('sha256')
  for (const file of files) {
    hash.update(relative(root, file).replace(/\\/g, '/'))
    hash.update('\0')
    hash.update(readFileSync(file))
    hash.update('\0')
  }
  return hash.digest('hex').slice(0, 16)
}

/** 构建时把指纹写进产物 HTML */
export function stampHtml(html: string, stamp: string): string {
  const marker = `<!-- ${STAMP_MARKER} build ${stamp} -->`
  return html.includes('<head>') ? html.replace('<head>', `<head>\n    ${marker}`) : `${marker}\n${html}`
}

/** 从产物 HTML 里读回指纹（没有就是 null） */
export function readStamp(html: string): string | null {
  const match = new RegExp(`<!--\\s*${STAMP_MARKER}\\s+build\\s+([0-9a-f]+)\\s*-->`).exec(html)
  return match ? match[1] : null
}
