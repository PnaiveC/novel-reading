import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadBookFromBytes } from '../../src/core/book'
import { computeBookSpan } from '../../src/core/position'

const samples = join(process.cwd(), 'samples')
const utf8Demo = join(samples, 'demo.txt')
const gbkDemo = join(samples, 'demo-gbk.txt')
/** 本机手测用的真小说（2MB+，不入库），没有就跳过 */
const bigNovel = join(samples, '龙族Ⅴ·悼亡者归来.txt')

function readBytes(path: string): Uint8Array {
  return new Uint8Array(readFileSync(path))
}

describe('真实样本：同一本书的 GBK / UTF-8（B1）', () => {
  it.skipIf(!existsSync(gbkDemo))('两个编码的文件解出一样的正文与目录', () => {
    const utf8 = loadBookFromBytes('demo.txt', readBytes(utf8Demo))
    const gbk = loadBookFromBytes('demo-gbk.txt', readBytes(gbkDemo))

    expect(gbk.encoding).toBe('gbk')
    expect(utf8.encoding).toBe('utf-8')
    expect(gbk.text).toBe(utf8.text)
    expect(gbk.chapters.map((chapter) => chapter.title)).toEqual(
      utf8.chapters.map((chapter) => chapter.title),
    )
    expect(gbk.chapters.length).toBeGreaterThan(2)
  })
})

describe('真实样本：大文件解析（B2 的目录完整性 + A2 的耗时）', () => {
  it.skipIf(!existsSync(bigNovel))('2MB 真小说：章节认得全、解析够快', () => {
    const bytes = readBytes(bigNovel)
    const started = Date.now()
    const book = loadBookFromBytes('龙族Ⅴ.txt', bytes)
    const elapsed = Date.now() - started

    expect(book.encoding).toBe('utf-8')
    expect(book.chapters.length).toBeGreaterThan(200)
    expect(book.chapters.filter((chapter) => /^第\d+章/.test(chapter.title)).length).toBeGreaterThan(200)

    const span = computeBookSpan(book.chapters)
    expect(span.offsets).toHaveLength(book.chapters.length)
    expect(span.total).toBeGreaterThan(book.text.length * 0.9)
    expect(elapsed).toBeLessThan(5000)
  })
})
