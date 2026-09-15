import { computed, ref } from 'vue'
import { bookFromText, loadBookFromBytes, type LoadedBook } from '../core/book'
import { createLibrary, StorageFullError, type Library, type StoredBook } from '../core/library'
import { splitParagraphs } from '../core/paragraphs'
import {
  migrateLegacyProgress,
  saveProgress,
  type ReadingProgress,
} from '../core/storage'

export type ReaderStatus = 'empty' | 'loading' | 'reading' | 'error'

/** 只要能给出文件名与字节，File / 测试替身都行 */
export interface OpenableFile {
  name: string
  size?: number
  arrayBuffer(): Promise<ArrayBuffer>
}

export interface UseReaderOptions {
  library?: Library
  now?: () => number
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return String(error)
}

/**
 * A 块的地基：打开 TXT → 正文上屏 → 记住这本书 → 记住读到哪儿。
 * 不碰 DOM 滚动，界面负责把「视口坐标」算成段落锚点后回传。
 */
export function useReader(options: UseReaderOptions = {}) {
  const library = options.library ?? createLibrary()
  const now = options.now ?? (() => Date.now())

  const status = ref<ReaderStatus>('empty')
  const errorMessage = ref('')
  const notice = ref('')
  const book = ref<LoadedBook | null>(null)
  const chapterIndex = ref(0)
  /** 当前章节待恢复到的段落下标（A4） */
  const anchorIndex = ref(0)

  const chapters = computed(() => book.value?.chapters ?? [])
  const chapter = computed(() => chapters.value[chapterIndex.value] ?? null)
  const paragraphs = computed(() => (chapter.value ? splitParagraphs(chapter.value.content) : []))
  const hasPrev = computed(() => chapterIndex.value > 0)
  const hasNext = computed(() => chapterIndex.value < chapters.value.length - 1)
  const chapterLabel = computed(() =>
    chapters.value.length ? `第 ${chapterIndex.value + 1}/${chapters.value.length} 章` : '',
  )

  /** 只动内存状态：切章 / 恢复锚点由界面按 anchorIndex 完成 */
  function show(loaded: LoadedBook, progress: ReadingProgress | null): void {
    book.value = loaded
    const last = Math.max(0, chapters.value.length - 1)
    chapterIndex.value = progress ? Math.min(Math.max(progress.chapterIndex, 0), last) : 0
    anchorIndex.value = progress ? Math.max(progress.paragraphIndex, 0) : 0
    status.value = 'reading'
    errorMessage.value = ''
  }

  function progressOf(loaded: LoadedBook): ReadingProgress | null {
    return migrateLegacyProgress(loaded.id, loaded.name, loaded.size)
  }

  /** 把这本书存到本机（A3）；存不下不致命，本次照读，只提示下次要重选 */
  async function remember(loaded: LoadedBook, previous: StoredBook | null): Promise<void> {
    try {
      const stamp = now()
      await library.saveBook({
        id: loaded.id,
        name: loaded.name,
        size: loaded.size,
        encoding: loaded.encoding,
        text: loaded.text,
        addedAt: previous?.addedAt ?? stamp,
        lastOpenedAt: stamp,
      })
      await library.setLastBook(loaded.id)
      notice.value = ''
    } catch (error) {
      const reason = error instanceof StorageFullError ? error.message : messageOf(error)
      notice.value = `本书没能存到本机（${reason}），这次照常读，下次打开需要重新选文件。`
    }
  }

  /** 从文件打开（A2）：识别编码 → 解码 → 切章 → 存本机 → 恢复进度 */
  async function openFile(file: OpenableFile): Promise<void> {
    status.value = 'loading'
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (!bytes.length) throw new Error('文件是空的')
      const loaded = loadBookFromBytes(file.name, bytes)
      const previous = await library.getBook(loaded.id).catch(() => null)
      show(loaded, progressOf(loaded))
      await remember(loaded, previous)
    } catch (error) {
      errorMessage.value = messageOf(error)
      status.value = 'error'
    }
  }

  /** 启动时自动回到上次那本书（A3） */
  async function restoreLastBook(): Promise<void> {
    status.value = 'loading'
    try {
      const stored = await library.getLastBook()
      if (!stored) {
        status.value = 'empty'
        return
      }
      const loaded = bookFromText(stored)
      show(loaded, progressOf(loaded))
      // 重开这本书，视作一次打开，让「最近」顺序保持正确
      await remember(loaded, stored)
    } catch (error) {
      errorMessage.value = messageOf(error)
      status.value = 'error'
    }
  }

  /** A4：记住当前章节与段落锚点 */
  function rememberPosition(paragraphIndex: number): void {
    if (!book.value) return
    const progress: ReadingProgress = {
      chapterIndex: chapterIndex.value,
      paragraphIndex: Math.max(0, Math.floor(paragraphIndex)),
      updatedAt: now(),
    }
    saveProgress(book.value.id, progress)
  }

  function goToChapter(index: number): void {
    const last = chapters.value.length - 1
    if (last < 0) return
    const next = Math.min(Math.max(index, 0), last)
    if (next === chapterIndex.value) return
    chapterIndex.value = next
    anchorIndex.value = 0
    rememberPosition(0)
  }

  return {
    status,
    errorMessage,
    notice,
    book,
    chapters,
    chapter,
    chapterIndex,
    anchorIndex,
    paragraphs,
    hasPrev,
    hasNext,
    chapterLabel,
    openFile,
    restoreLastBook,
    rememberPosition,
    goToChapter,
    nextChapter: () => goToChapter(chapterIndex.value + 1),
    prevChapter: () => goToChapter(chapterIndex.value - 1),
    clearNotice: () => {
      notice.value = ''
    },
  }
}

export type Reader = ReturnType<typeof useReader>
