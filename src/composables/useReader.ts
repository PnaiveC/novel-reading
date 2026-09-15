import { computed, ref } from 'vue'
import { bookFromText, computeBookId, loadBookFromBytes, type LoadedBook } from '../core/book'
import { ENCODING_LABELS, looksGarbled, type Encoding } from '../core/encoding'
import { createLibrary, StorageFullError, type Library, type StoredBook } from '../core/library'
import { splitParagraphs } from '../core/paragraphs'
import { computeBookSpan, percentAt, positionLabel } from '../core/position'
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
  /** 当前章节的段落锚点（A4）：恢复用，也随滚动更新（B6 的全书百分比要看它） */
  const anchorIndex = ref(0)
  /** 原始字节 + 是否手动指定过编码（B1） */
  const rawBytes = ref<Uint8Array | null>(null)
  const encodingLocked = ref(false)
  /** 正文换过一次就自增：界面据此重新落位（换书、换编码都会变） */
  const revision = ref(0)
  let stored: StoredBook | null = null
  /** 用户真实待过的位置：换编码重排章节时用它还原，别被换坏的解码结果顶掉 */
  let anchorMemory: { chapterIndex: number; paragraphIndex: number } | null = null

  const chapters = computed(() => book.value?.chapters ?? [])
  const chapter = computed(() => chapters.value[chapterIndex.value] ?? null)
  const paragraphs = computed(() => (chapter.value ? splitParagraphs(chapter.value.content) : []))
  const hasPrev = computed(() => chapterIndex.value > 0)
  const hasNext = computed(() => chapterIndex.value < chapters.value.length - 1)
  const encoding = computed<Encoding>(() => book.value?.encoding ?? 'utf-8')
  const canSwitchEncoding = computed(() => Boolean(rawBytes.value?.length))
  const span = computed(() => computeBookSpan(chapters.value))
  const percent = computed(() => {
    const total = paragraphs.value.length
    // 段落锚点当作「章内进度」：第一段是 0%，最后一段是 100%（只有一段就整章算完）
    const ratio = total > 1 ? anchorIndex.value / (total - 1) : total === 1 ? 1 : 0
    return percentAt(span.value, chapterIndex.value, ratio)
  })
  const chapterLabel = computed(() =>
    positionLabel(chapterIndex.value, chapters.value.length, percent.value),
  )
  const encodingLabel = computed(() => ENCODING_LABELS[encoding.value])

  /** 只动内存状态：切章 / 恢复锚点由界面按 anchorIndex 完成 */
  function show(loaded: LoadedBook, progress: ReadingProgress | null): void {
    book.value = loaded
    const last = Math.max(0, loaded.chapters.length - 1)
    chapterIndex.value = progress ? Math.min(Math.max(progress.chapterIndex, 0), last) : 0
    const maxParagraph = Math.max(
      0,
      splitParagraphs(loaded.chapters[chapterIndex.value]?.content ?? '').length - 1,
    )
    anchorIndex.value = progress ? Math.min(Math.max(progress.paragraphIndex, 0), maxParagraph) : 0
    status.value = 'reading'
    errorMessage.value = ''
    revision.value++
  }

  function progressOf(loaded: LoadedBook): ReadingProgress | null {
    return migrateLegacyProgress(loaded.id, loaded.name, loaded.size)
  }

  /** 把这本书存到本机（A3）；存不下不致命，本次照读，只提示下次要重选 */
  async function remember(loaded: LoadedBook): Promise<void> {
    const previous = stored
    try {
      const stamp = now()
      const record: StoredBook = {
        id: loaded.id,
        name: loaded.name,
        size: loaded.size,
        encoding: loaded.encoding,
        text: loaded.text,
        addedAt: previous?.addedAt ?? stamp,
        lastOpenedAt: stamp,
        bytes: loaded.bytes,
        encodingLocked: encodingLocked.value,
      }
      await library.saveBook(record)
      await library.setLastBook(loaded.id)
      stored = record
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
      const previous = await library.getBook(computeBookId(bytes)).catch(() => null)
      // 上次手动选过编码就沿用（B1），别再让自动识别顶掉用户的选择
      const loaded = loadBookFromBytes(file.name, bytes, previous?.encodingLocked ? previous.encoding : undefined)
      rawBytes.value = bytes
      encodingLocked.value = Boolean(previous?.encodingLocked)
      stored = previous
      show(loaded, progressOf(loaded))
      anchorMemory = { chapterIndex: chapterIndex.value, paragraphIndex: anchorIndex.value }
      await remember(loaded)
      if (!notice.value && looksGarbled(loaded.text)) {
        notice.value = '正文看着像乱码，去「排版」里手动换个编码试试。'
      }
    } catch (error) {
      errorMessage.value = messageOf(error)
      status.value = 'error'
    }
  }

  /** 启动时自动回到上次那本书（A3） */
  async function restoreLastBook(): Promise<void> {
    status.value = 'loading'
    try {
      const last = await library.getLastBook()
      if (!last) {
        status.value = 'empty'
        return
      }
      stored = last
      rawBytes.value = last.bytes?.length ? last.bytes : null
      encodingLocked.value = Boolean(last.encodingLocked)
      const loaded = last.bytes?.length
        ? loadBookFromBytes(last.name, last.bytes, last.encoding)
        : bookFromText(last)
      show(loaded, progressOf(loaded))
      anchorMemory = { chapterIndex: chapterIndex.value, paragraphIndex: anchorIndex.value }
      // 重开这本书，视作一次打开，让「最近」顺序保持正确
      await remember(loaded)
    } catch (error) {
      errorMessage.value = messageOf(error)
      status.value = 'error'
    }
  }

  /**
   * B1：手动切换编码。用原始字节重解码再切章，章节 / 段落锚点尽量保持原位，
   * 换完把新结果存回本机，下次打开直接用它。
   */
  async function setEncoding(next: Encoding): Promise<void> {
    const bytes = rawBytes.value
    const current = book.value
    if (!bytes?.length || !current || current.encoding === next) return
    const memory = anchorMemory ?? {
      chapterIndex: chapterIndex.value,
      paragraphIndex: anchorIndex.value,
    }
    const loaded = loadBookFromBytes(current.name, bytes, next)
    encodingLocked.value = true
    show(loaded, { ...memory, updatedAt: now() })
    await remember(loaded)
    if (!notice.value) {
      notice.value = looksGarbled(loaded.text) ? '这个编码下还是乱码，再换一个试试。' : ''
    }
  }

  /** A4：记住当前章节与段落锚点 */
  function rememberPosition(paragraphIndex: number): void {
    if (!book.value) return
    anchorIndex.value = Math.max(0, Math.floor(paragraphIndex))
    anchorMemory = { chapterIndex: chapterIndex.value, paragraphIndex: anchorIndex.value }
    const progress: ReadingProgress = {
      chapterIndex: chapterIndex.value,
      paragraphIndex: anchorIndex.value,
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
    revision,
    paragraphs,
    hasPrev,
    hasNext,
    chapterLabel,
    percent,
    encoding,
    encodingLabel,
    canSwitchEncoding,
    encodingLocked,
    openFile,
    restoreLastBook,
    setEncoding,
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
