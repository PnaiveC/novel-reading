import { describe, expect, it } from 'vitest'
import { bookFromText, computeBookId, loadBookFromBytes } from '../../src/core/book'

const encoder = new TextEncoder()

/** GBK：第一章\n正文 */
const GBK_SAMPLE = Uint8Array.from([0xb5, 0xda, 0xd2, 0xbb, 0xd5, 0xc2, 0x0a, 0xd5, 0xfd, 0xce, 0xc4])

describe('computeBookId', () => {
  it('同内容同 id，改一个字节就变', () => {
    const a = encoder.encode('第一章\n正文')
    expect(computeBookId(a)).toBe(computeBookId(encoder.encode('第一章\n正文')))
    expect(computeBookId(a)).not.toBe(computeBookId(encoder.encode('第一章\n正文。')))
  })

  it('长度不同也不会撞', () => {
    expect(computeBookId(new Uint8Array(10))).not.toBe(computeBookId(new Uint8Array(11)))
  })
})

describe('loadBookFromBytes', () => {
  it('UTF-8 文本：识别编码、切章', () => {
    const book = loadBookFromBytes('demo.txt', encoder.encode('第一章 初见\n正文一\n\n第二章 重逢\n正文二'))
    expect(book.encoding).toBe('utf-8')
    expect(book.name).toBe('demo.txt')
    expect(book.chapters.map((chapter) => chapter.title)).toEqual(['第一章 初见', '第二章 重逢'])
  })

  it('GBK 文本：不乱码', () => {
    const book = loadBookFromBytes('gbk.txt', GBK_SAMPLE)
    expect(book.encoding).toBe('gbk')
    expect(book.chapters[0].title).toBe('第一章')
    expect(book.chapters[0].content).toContain('正文')
  })

  it('书号只看内容：改文件名不丢进度', () => {
    const bytes = encoder.encode('第一章\n正文')
    expect(loadBookFromBytes('a.txt', bytes).id).toBe(loadBookFromBytes('b.txt', bytes).id)
  })
})

describe('bookFromText', () => {
  it('去掉 BOM 后再切章', () => {
    const book = bookFromText({
      id: 'x',
      name: 'bom.txt',
      size: 3,
      encoding: 'utf-8',
      text: '\uFEFF第一章\n正文',
    })
    expect(book.text.startsWith('\uFEFF')).toBe(false)
    expect(book.chapters[0].title).toBe('第一章')
  })
})
