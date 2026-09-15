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
    expect(reader.chapterLabel.value).toBe('第 1/2 章')
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
    await first.openFile(fileOf('novel.txt', encoder.encode(NOVEL)))
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
