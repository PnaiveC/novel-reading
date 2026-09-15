import { beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { useReader } from '../../src/composables/useReader'
import { createLibrary, type Library } from '../../src/core/library'
import { clearStorage, fileKey, loadProgress, saveProgress } from '../../src/core/storage'
import { fileOf, memoryStorage } from '../helpers/fakes'

const encoder = new TextEncoder()

const NOVEL = [
  '第一章 初见',
  '正文一。',
  '正文二。',
  '',
  '第二章 重逢',
  '正文三。',
].join('\n')

const LONG_NOVEL = [
  '第一章 初见',
  '一之一。',
  '一之二。',
  '一之三。',
  '',
  '第二章 重逢',
  '二之一。',
  '二之二。',
  '二之三。',
  '二之四。',
].join('\n')

function newLibrary(): Library {
  return createLibrary({ indexedDb: new IDBFactory(), storage: memoryStorage() })
}

beforeEach(() => {
  clearStorage()
})

describe('useReader：打开一本 TXT（A2）', () => {
  it('打开后正文立刻上屏，章节可用', async () => {
    const reader = useReader({ library: newLibrary() })
    await reader.openFile(fileOf('novel.txt', encoder.encode(NOVEL)))

    expect(reader.status.value).toBe('reading')
    expect(reader.chapter.value?.title).toBe('第一章 初见')
    expect(reader.paragraphs.value).toEqual(['正文一。', '正文二。'])
    expect(reader.chapterLabel.value).toBe('第 1/2 章 · 全书 0%')
    expect(reader.hasNext.value).toBe(true)
    expect(reader.hasPrev.value).toBe(false)
  })

  it('空文件给出明确报错，不假装在读', async () => {
    const reader = useReader({ library: newLibrary() })
    await reader.openFile(fileOf('empty.txt', new Uint8Array()))
    expect(reader.status.value).toBe('error')
    expect(reader.errorMessage.value).toContain('空')
  })

  it('切章：上一章 / 下一章 在两端不越界', async () => {
    const reader = useReader({ library: newLibrary() })
    await reader.openFile(fileOf('novel.txt', encoder.encode(NOVEL)))
    reader.nextChapter()
    expect(reader.chapterIndex.value).toBe(1)
    expect(reader.hasNext.value).toBe(false)
    reader.nextChapter()
    expect(reader.chapterIndex.value).toBe(1)
    reader.prevChapter()
    expect(reader.chapterIndex.value).toBe(0)
  })
})

describe('useReader：记住上次这本书（A3）', () => {
  it('关掉再开：不用重选文件就回到这本书', async () => {
    const library = newLibrary()
    const first = useReader({ library })
    await first.openFile(fileOf('novel.txt', encoder.encode(NOVEL)))

    const second = useReader({ library })
    await second.restoreLastBook()
    expect(second.status.value).toBe('reading')
    expect(second.book.value?.name).toBe('novel.txt')
    expect(second.chapter.value?.title).toBe('第一章 初见')
  })

  it('没读过的书：空态，不是报错', async () => {
    const reader = useReader({ library: newLibrary() })
    await reader.restoreLastBook()
    expect(reader.status.value).toBe('empty')
  })

  it('同一本书再打开不会重复入库', async () => {
    const library = newLibrary()
    const first = useReader({ library })
    await first.openFile(fileOf('novel.txt', encoder.encode(NOVEL)))
    const stored = await library.getLastBook()
    await first.openFile(fileOf('novel.txt', encoder.encode(NOVEL)))
    expect((await library.getLastBook())?.addedAt).toBe(stored?.addedAt)
  })

  it('本机存不下时只提示，当前这次照读', async () => {
    const full: Storage = {
      length: 0,
      clear: () => undefined,
      key: () => null,
      getItem: () => null,
      removeItem: () => undefined,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    const reader = useReader({ library: createLibrary({ indexedDb: null, storage: full }) })
    await reader.openFile(fileOf('big.txt', encoder.encode(NOVEL)))
    expect(reader.status.value).toBe('reading')
    expect(reader.notice.value).toContain('没能存到本机')
  })
})

describe('useReader：进度记忆（A4）', () => {
  it('章节 + 段落锚点都记住，重开回到同一段', async () => {
    const library = newLibrary()
    const first = useReader({ library })
    await first.openFile(fileOf('novel.txt', encoder.encode(LONG_NOVEL)))
    first.nextChapter()
    first.rememberPosition(2)

    const second = useReader({ library })
    await second.restoreLastBook()
    expect(second.chapterIndex.value).toBe(1)
    expect(second.anchorIndex.value).toBe(2)
  })

  it('切章先把新章第 0 段写进进度，避免下次落在上一章', async () => {
    const library = newLibrary()
    const reader = useReader({ library })
    await reader.openFile(fileOf('novel.txt', encoder.encode(NOVEL)))
    reader.nextChapter()
    expect(loadProgress(reader.book.value!.id)).toMatchObject({
      chapterIndex: 1,
      paragraphIndex: 0,
    })
  })

  it('v1 的老进度（文件名 + 大小）自动搬家到内容哈希', async () => {
    const bytes = encoder.encode(NOVEL)
    saveProgress(fileKey('novel.txt', bytes.length), { chapterIndex: 1, paragraphIndex: 0, updatedAt: 7 })

    const reader = useReader({ library: newLibrary() })
    await reader.openFile(fileOf('novel.txt', bytes))
    expect(reader.chapterIndex.value).toBe(1)
    expect(loadProgress(fileKey('novel.txt', bytes.length))).toBeNull()
  })
})

describe('useReader：编码识别与手动切换（B1）', () => {
  it('GBK 文件自动识别后正文不乱码', async () => {
    const reader = useReader({ library: newLibrary() })
    // “第一章 测试\n正文” 的 GBK 字节
    const gbk = Uint8Array.from([
      0xb5, 0xda, 0xd2, 0xbb, 0xd5, 0xc2, 0x20, 0xb2, 0xe2, 0xca, 0xd4, 0x0a, 0xd5, 0xfd, 0xce, 0xc4,
    ])
    await reader.openFile(fileOf('gbk.txt', gbk))
    expect(reader.encoding.value).toBe('gbk')
    expect(reader.chapter.value?.title).toBe('第一章 测试')
    expect(reader.book.value?.text).toContain('正文')
  })

  it('手滑选错编码能切回来，阅读位置不丢', async () => {
    const library = newLibrary()
    const reader = useReader({ library })
    await reader.openFile(fileOf('novel.txt', encoder.encode(LONG_NOVEL)))
    reader.nextChapter()
    reader.rememberPosition(3)
    expect(reader.chapterIndex.value).toBe(1)
    expect(reader.anchorIndex.value).toBe(3)

    await reader.setEncoding('gbk')
    expect(reader.encoding.value).toBe('gbk')
    expect(reader.status.value).toBe('reading')

    await reader.setEncoding('utf-8')
    expect(reader.encoding.value).toBe('utf-8')
    expect(reader.chapter.value?.title).toBe('第二章 重逢')
    expect(reader.chapterIndex.value).toBe(1)
    expect(reader.anchorIndex.value).toBe(3)
    expect(reader.paragraphs.value).toEqual(['二之一。', '二之二。', '二之三。', '二之四。'])
  })

  it('手动选过的编码会被记住，再打开同一本书不退回自动识别', async () => {
    const library = newLibrary()
    const bytes = encoder.encode(NOVEL)
    const first = useReader({ library })
    await first.openFile(fileOf('novel.txt', bytes))
    await first.setEncoding('gbk')

    const second = useReader({ library })
    await second.openFile(fileOf('novel.txt', bytes))
    expect(second.encoding.value).toBe('gbk')
    expect(second.encodingLocked.value).toBe(true)
  })

  it('本机没留原始字节（老缓存）时切不了编码，但照样读', async () => {
    const library = newLibrary()
    await library.saveBook({
      id: 'hash-legacy',
      name: 'legacy.txt',
      size: 20,
      encoding: 'utf-8',
      text: NOVEL,
      addedAt: 1,
      lastOpenedAt: 2,
    })
    await library.setLastBook('hash-legacy')

    const reader = useReader({ library })
    await reader.restoreLastBook()
    expect(reader.status.value).toBe('reading')
    expect(reader.canSwitchEncoding.value).toBe(false)
    await reader.setEncoding('gb18030')
    expect(reader.encoding.value).toBe('utf-8')
  })

  it('解码出来满是替换字符时提示去手动换编码', async () => {
    const reader = useReader({ library: newLibrary() })
    // 既不是合法 UTF-8、也不是合法 GBK 的字节
    const broken = new Uint8Array([0x81, 0x2f, 0x0a, 0x81, 0x2f, 0x0a, 0x80, 0x20])
    await reader.openFile(fileOf('broken.txt', broken))
    expect(reader.status.value).toBe('reading')
    expect(reader.encoding.value).toBe('gbk')
    expect(reader.notice.value).toContain('乱码')
  })
})

describe('useReader：位置提示与目录（B3 / B6）', () => {
  it('底部提示带上全书百分比，读完最后一章是 100%', async () => {
    const reader = useReader({ library: newLibrary() })
    await reader.openFile(fileOf('novel.txt', encoder.encode(NOVEL)))
    expect(reader.chapterLabel.value).toMatch(/^第 1\/2 章 · 全书 \d+%$/)

    reader.goToChapter(1)
    expect(reader.chapterLabel.value).toBe('第 2/2 章 · 全书 100%')
  })

  it('目录跳转：任意章节都能直接到位', async () => {
    const reader = useReader({ library: newLibrary() })
    await reader.openFile(fileOf('novel.txt', encoder.encode(NOVEL)))
    reader.goToChapter(1)
    expect(reader.chapter.value?.title).toBe('第二章 重逢')
    reader.goToChapter(0)
    expect(reader.chapter.value?.title).toBe('第一章 初见')
  })
})
