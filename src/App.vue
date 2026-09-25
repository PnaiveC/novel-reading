<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import BookmarkPanel from './components/BookmarkPanel.vue'
import RecentPanel from './components/RecentPanel.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import ShortcutPanel from './components/ShortcutPanel.vue'
import TocPanel from './components/TocPanel.vue'
import { makeBookmark, removeBookmark, upsertBookmark, type Bookmark } from './core/bookmarks'
import { createLibrary, type BookSummary, type Library } from './core/library'
import type { Encoding } from './core/encoding'
import { FONT_STACKS } from './core/settings'
import type { ShortcutActionId } from './core/shortcuts'
import { nextTheme, resolveTheme, systemPrefersDark, watchSystemTheme } from './core/theme'
import { useReader } from './composables/useReader'
import { useSettings } from './composables/useSettings'
import { useShortcuts } from './composables/useShortcuts'
import { useUiPrefs } from './composables/useUiPrefs'
import { createReadingViewport, type ChapterWindow, type ReadingViewport } from './reader/viewport'

const props = defineProps<{ library?: Library }>()

const library = props.library ?? createLibrary()

const {
  status,
  errorMessage,
  notice,
  book,
  chapters,
  chapter,
  chapterIndex,
  anchorIndex,
  revision,
  hasPrev,
  hasNext,
  chapterLabel,
  encoding,
  encodingLabel,
  canSwitchEncoding,
  paragraphsOf,
  openFile,
  restoreLastBook,
  openStored,
  setEncoding,
  setPosition,
  jumpTo,
  nextChapter,
  prevChapter,
} = useReader({ library })

const { settings, update: updateSettings, reset: resetSettings } = useSettings()
const { bindings: shortcuts, setKey, reset: resetShortcuts, match, hint } = useShortcuts()
const { prefs, update: updatePrefs, toggleImmersive } = useUiPrefs()

const scrollEl = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const dragging = ref(false)
const tocOpen = ref(false)
const settingsOpen = ref(false)
const sheet = ref<'recent' | 'bookmarks' | 'shortcuts' | null>(null)
const recentBooks = ref<BookSummary[]>([])
const bookmarks = ref<Bookmark[]>([])
const toast = ref('')
const systemDark = ref(systemPrefersDark())
const revealTop = ref(false)
const revealBottom = ref(false)

/** C4：连着渲染的章节窗口（阅读视口通知过来，这里只是镜像给模板用） */
const windowRange = ref<ChapterWindow>({ start: 0, end: 0 })

const immersive = computed(() => prefs.value.immersive)
const barVisible = computed(
  () => !immersive.value || revealTop.value || tocOpen.value || settingsOpen.value || sheet.value !== null,
)
const statusVisible = computed(
  () => !immersive.value || revealBottom.value || sheet.value !== null || Boolean(toast.value),
)

const renderedChapters = computed(() => {
  const total = chapters.value.length
  if (!total) return []
  const start = Math.min(Math.max(windowRange.value.start, 0), total - 1)
  const end = Math.min(Math.max(windowRange.value.end, start), total - 1)
  const list: number[] = []
  for (let index = start; index <= end; index++) list.push(index)
  return list
})

/** 排版设置落到 CSS 变量（B4）：改一下立刻生效，不用重建正文 */
const readerStyle = computed(() => ({
  '--reader-font': FONT_STACKS[settings.value.fontFamily],
  '--reader-size': `${settings.value.fontSize}px`,
  '--reader-line': String(settings.value.lineHeight),
  '--reader-width': `${settings.value.maxWidth}em`,
  '--reader-para-gap': `${settings.value.paragraphSpacing}em`,
  '--reader-indent': `${settings.value.indent}em`,
}))

const keysHint = computed(
  () =>
    `${hint('prevChapter')} / ${hint('nextChapter')} 翻章 · ${hint('pageDown')} 翻页 · ` +
    `${hint('toc')} 目录 · ${hint('settings')} 排版 · ${hint('bookmark')} 书签 · ${hint('recent')} 最近`,
)

/* ------------------------------------------------------------------ C1 主题 */

const resolvedTheme = computed(() => resolveTheme(settings.value.theme, systemDark.value))

watchEffect(() => {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = resolvedTheme.value
  document.documentElement.style.colorScheme = resolvedTheme.value === 'dark' ? 'dark' : 'light'
})

let stopSystemTheme: () => void = () => {}

/* ------------------------------------------------------------------ 位置与连读 */

/**
 * N1：阅读视口。测量、章节窗口、滚动补偿、位置反推都在 module 里，
 * 这一层只接线——它的两个出口接回 useReader（位置落盘）与模板（渲染哪几章）。
 */
let viewport: ReadingViewport | null = null

watch(
  scrollEl,
  (el, _previous, onCleanup) => {
    if (!el) return
    const instance = createReadingViewport({
      container: el,
      chapterCount: () => chapters.value.length,
      afterRender: () => nextTick(),
    })
    viewport = instance
    const stopWindow = instance.onWindowChange((next) => {
      windowRange.value = next
    })
    const stopPosition = instance.onPosition((position) => {
      setPosition(position.chapterIndex, position.paragraphIndex)
    })
    void instance.jumpTo(chapterIndex.value, anchorIndex.value)
    onCleanup(() => {
      stopWindow()
      stopPosition()
      instance.destroy()
      if (viewport === instance) viewport = null
    })
  },
  { flush: 'post' },
)

function flushPosition(): void {
  viewport?.syncPosition()
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'hidden') flushPosition()
}

watch([() => book.value?.id, revision], async () => {
  if (status.value !== 'reading') return
  await viewport?.jumpTo(chapterIndex.value, anchorIndex.value)
})

watch(
  () => book.value?.id,
  async (id) => {
    bookmarks.value = id ? await library.loadBookmarks(id) : []
  },
)

watch(chapters, () => {
  const last = Math.max(0, chapters.value.length - 1)
  if (chapterIndex.value > last) chapterIndex.value = last
})

/* ------------------------------------------------------------------ 面板 */

let toastTimer = 0

function flash(message: string): void {
  toast.value = message
  if (toastTimer) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toast.value = ''
  }, 2400)
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error)
}

/** 目录宽度：拖动中只改本地状态，松手才落盘 */
const tocWidth = ref(prefs.value.tocWidth)

function dragToc(width: number): void {
  tocWidth.value = width
}

function saveTocWidth(width: number): void {
  tocWidth.value = width
  updatePrefs({ tocWidth: width })
}

function openSheet(next: 'recent' | 'bookmarks' | 'shortcuts'): void {
  if (sheet.value === next) {
    sheet.value = null
    return
  }
  sheet.value = next
  if (next === 'recent') void refreshRecent()
}

async function refreshRecent(): Promise<void> {
  try {
    recentBooks.value = await library.listBooks()
  } catch {
    recentBooks.value = []
  }
}

async function openRecentBook(id: string): Promise<void> {
  sheet.value = null
  await openStored(id)
}

async function dropBook(id: string): Promise<void> {
  const current = book.value?.id === id
  try {
    // 一次删掉这本书的全部足迹：正文 / 索引 / 进度 / 书签 / 上次打开指针
    await library.removeBook(id)
    await refreshRecent()
    flash(current ? '已从本机删掉这本，本次阅读不受影响，下次打开要重新选文件' : '已从本机删掉这本')
  } catch (error) {
    flash(`删不掉：${error instanceof Error ? error.message : String(error)}`)
  }
}

async function addBookmark(): Promise<void> {
  const current = book.value
  if (!current) {
    flash('还没有打开的书，书签没加成')
    return
  }
  const text = paragraphsOf(chapterIndex.value)[anchorIndex.value] ?? ''
  const bookmark = makeBookmark({
    chapterIndex: chapterIndex.value,
    paragraphIndex: anchorIndex.value,
    chapterTitle: chapter.value?.title ?? '',
    text,
    createdAt: Date.now(),
  })
  const before = bookmarks.value
  const exists = before.some((item) => item.id === bookmark.id)
  const next = upsertBookmark(before, bookmark)
  try {
    await library.saveBookmarks(current.id, next)
  } catch (error) {
    flash(`书签没存下（${messageOf(error)}），换个位置再试试`)
    return
  }
  bookmarks.value = next
  flash(exists ? '这条书签已经有了 · 已更新时间' : `已加书签 · ${chapter.value?.title ?? ''}`)
}

function pickBookmark(bookmark: Bookmark): void {
  sheet.value = null
  jumpTo(bookmark.chapterIndex, bookmark.paragraphIndex)
}

async function dropBookmark(id: string): Promise<void> {
  const current = book.value
  if (!current) {
    flash('还没有打开的书，书签没删掉')
    return
  }
  const next = removeBookmark(bookmarks.value, id)
  try {
    await library.saveBookmarks(current.id, next)
  } catch (error) {
    flash(`书签没删掉（${messageOf(error)}）`)
    return
  }
  bookmarks.value = next
  flash('已删掉这条书签')
}

function cycleTheme(): void {
  const next = nextTheme(settings.value.theme)
  updateSettings({ theme: next })
  const label = resolvedTheme.value === 'dark' ? '夜间' : resolvedTheme.value === 'sepia' ? '护眼' : '日间'
  flash(next === 'auto' ? `主题：跟随系统（当前${label}）` : `主题：${label}`)
}

function applyShortcut(id: ShortcutActionId, key: string): { ok: boolean; message: string } {
  const result = setKey(id, key)
  if (result.ok) flash(result.message)
  return result
}

/* ------------------------------------------------------------------ C2 沉浸模式 */

function onPointerMove(event: MouseEvent): void {
  if (!immersive.value) return
  const height = window.innerHeight || 0
  revealTop.value = event.clientY <= 64
  revealBottom.value = height > 0 && event.clientY >= height - 56
}

function onPointerLeave(): void {
  revealTop.value = false
  revealBottom.value = false
}

function onEncodingChange(value: Encoding): void {
  void setEncoding(value)
}

watch(immersive, (on) => {
  if (!on) return
  revealTop.value = false
  revealBottom.value = false
})

/* ------------------------------------------------------------------ 快捷键 */

function runAction(id: ShortcutActionId): void {
  switch (id) {
    case 'prevChapter':
      prevChapter()
      break
    case 'nextChapter':
      nextChapter()
      break
    case 'pageDown':
      viewport?.turnPage(1)
      break
    case 'pageUp':
      viewport?.turnPage(-1)
      break
    case 'chapterStart':
      viewport?.chapterStart()
      break
    case 'chapterEnd':
      viewport?.chapterEnd()
      break
    case 'toc':
      tocOpen.value = !tocOpen.value
      settingsOpen.value = false
      sheet.value = null
      break
    case 'settings':
      settingsOpen.value = !settingsOpen.value
      tocOpen.value = false
      sheet.value = null
      break
    case 'bookmark':
      addBookmark()
      break
    case 'bookmarks':
      openSheet('bookmarks')
      break
    case 'recent':
      openSheet('recent')
      break
    case 'theme':
      cycleTheme()
      break
    case 'immersive':
      toggleImmersive()
      break
    default:
      break
  }
}

function onKeydown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null
  if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
  if (event.altKey || event.ctrlKey || event.metaKey) return

  if (event.key === 'Escape') {
    event.preventDefault()
    if (sheet.value) sheet.value = null
    else if (tocOpen.value || settingsOpen.value) {
      tocOpen.value = false
      settingsOpen.value = false
    } else if (immersive.value) toggleImmersive()
    return
  }

  if (status.value !== 'reading') return
  const action = match(event)
  if (!action) return
  event.preventDefault()
  runAction(action)
}

/* ------------------------------------------------------------------ 打开文件 */

function openPicker(): void {
  fileInput.value?.click()
}

async function onPick(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) await openFile(file)
}

async function onDrop(event: DragEvent): Promise<void> {
  dragging.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) await openFile(file)
}

onMounted(() => {
  stopSystemTheme = watchSystemTheme((dark) => {
    systemDark.value = dark
  })
  window.addEventListener('beforeunload', flushPosition)
  window.addEventListener('keydown', onKeydown)
  document.addEventListener('visibilitychange', onVisibilityChange)
  void restoreLastBook()
})

onBeforeUnmount(() => {
  stopSystemTheme()
  viewport?.destroy()
  if (toastTimer) window.clearTimeout(toastTimer)
  window.removeEventListener('beforeunload', flushPosition)
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('visibilitychange', onVisibilityChange)
})
</script>

<template>
  <div
    class="app"
    :class="{
      immersive,
      pinned: tocOpen || settingsOpen,
      'reveal-top': revealTop,
      'reveal-bottom': revealBottom,
    }"
    :style="readerStyle"
    @dragover.prevent="dragging = true"
    @dragleave="dragging = false"
    @drop.prevent="onDrop"
    @mousemove="onPointerMove"
    @mouseleave="onPointerLeave"
  >
    <input
      ref="fileInput"
      class="file-input"
      type="file"
      accept=".txt,text/plain"
      @change="onPick"
    />

    <template v-if="status === 'reading'">
      <header class="bar" :class="{ hidden: !barVisible }">
        <button
          class="nav toggler"
          :class="{ on: tocOpen }"
          :title="`目录（${hint('toc')}）`"
          @click="runAction('toc')"
        >
          目录
        </button>
        <button class="nav" :disabled="!hasPrev" :title="`上一章（${hint('prevChapter')}）`" @click="prevChapter()">
          上一章
        </button>
        <button class="nav" :disabled="!hasNext" :title="`下一章（${hint('nextChapter')}）`" @click="nextChapter()">
          下一章
        </button>
        <div class="where">
          <span class="book-name">{{ book?.name }}</span>
          <span class="chapter-name">{{ chapter?.title }}</span>
        </div>
        <button
          class="nav toggler"
          :title="`书签列表（${hint('bookmarks')}）；加书签 ${hint('bookmark')}`"
          @click="runAction('bookmarks')"
        >
          书签<span v-if="bookmarks.length" class="count">{{ bookmarks.length }}</span>
        </button>
        <button
          class="nav toggler"
          :class="{ on: settingsOpen }"
          :title="`排版与设置（${hint('settings')}）`"
          @click="runAction('settings')"
        >
          排版
        </button>
        <button class="nav toggler" :title="`最近打开（${hint('recent')}）`" @click="runAction('recent')">
          最近
        </button>
        <button class="open" @click="openPicker">换一本</button>
      </header>

      <div class="body">
        <TocPanel
          v-if="tocOpen"
          :chapters="chapters"
          :current="chapterIndex"
          :book-name="book?.name"
          :width="tocWidth"
          @pick="jumpTo($event, 0)"
          @resize="dragToc"
          @resize-end="saveTocWidth"
          @close="tocOpen = false"
        />

        <div class="column">
          <SettingsPanel
            v-if="settingsOpen"
            :settings="settings"
            :encoding="encoding"
            :encoding-label="encodingLabel"
            :can-switch-encoding="canSwitchEncoding"
            :immersive="immersive"
            @update="updateSettings"
            @encoding="onEncodingChange"
            @immersive="toggleImmersive"
            @shortcuts="openSheet('shortcuts')"
            @reset="resetSettings"
            @close="settingsOpen = false"
          />

          <main ref="scrollEl" class="reader">
            <article class="page">
              <section
                v-for="index in renderedChapters"
                :key="index"
                class="chapter"
                :data-chapter="index"
              >
                <h1 class="chapter-title">{{ chapters[index]?.title }}</h1>
                <p
                  v-for="(textItem, pIndex) in paragraphsOf(index)"
                  :key="pIndex"
                  :data-p="pIndex"
                  class="para"
                >
                  {{ textItem }}
                </p>
              </section>
              <p v-if="windowRange.end >= chapters.length - 1" class="tail">
                <button v-if="hasNext" class="nav" @click="nextChapter()">下一章 →</button>
                <span v-else class="end">— 全书完 —</span>
              </p>
            </article>
          </main>

          <footer class="status" :class="{ hidden: !statusVisible }">
            <span class="pos">{{ chapterLabel }}</span>
            <span class="keys">{{ keysHint }}</span>
            <span v-if="notice" class="notice">⚠ {{ notice }}</span>
          </footer>
        </div>
      </div>
    </template>

    <section v-else-if="status === 'loading'" class="center">
      <p class="muted">正在打开…</p>
    </section>

    <section v-else-if="status === 'error'" class="center">
      <p class="error">打不开这个文件：{{ errorMessage }}</p>
      <button class="primary" @click="openPicker">重新选一个 TXT</button>
    </section>

    <section v-else class="center">
      <h1 class="title">把 TXT 小说拖进来</h1>
      <p class="muted">或者</p>
      <button class="primary" @click="openPicker">选择文件</button>
      <p class="fine">
        单文件、断网可用；打开过的书留在本机，下次打开自动回到上次读到的位置，最近读过的几本也能一键接着读。
      </p>
    </section>

    <RecentPanel
      v-if="sheet === 'recent'"
      :books="recentBooks"
      :current-id="book?.id"
      @open="openRecentBook"
      @remove="dropBook"
      @close="sheet = null"
    />

    <BookmarkPanel
      v-if="sheet === 'bookmarks'"
      :bookmarks="bookmarks"
      :book-name="book?.name"
      @pick="pickBookmark"
      @add="addBookmark"
      @remove="dropBookmark"
      @close="sheet = null"
    />

    <ShortcutPanel
      v-if="sheet === 'shortcuts'"
      :bindings="shortcuts"
      :apply="applyShortcut"
      @reset="resetShortcuts"
      @close="sheet = null"
    />

    <div v-if="dragging" class="veil"><span>松手即打开</span></div>
    <!-- 提示浮在最上层：书签面板 / 沉浸模式下也看得见（操作必须有反馈） -->
    <div v-if="toast" class="toast-float" role="status">{{ toast }}</div>
   </div>
</template>

<style>
:root,
html[data-theme='light'] {
  --bg: #f6f3ec;
  --fg: #2c2a26;
  --bar: #fbf9f4;
  --panel: #f4f1e9;
  --border: #e3ddd0;
  --muted: #9a9384;
  --faint: #b8b1a3;
  --hover: #ebe6da;
  --active: #e2dccc;
  --accent: #b06a2c;
  --veil: rgba(44, 42, 38, 0.35);
}

html[data-theme='sepia'] {
  --bg: #f3ead7;
  --fg: #3b3225;
  --bar: #f7f0e1;
  --panel: #efe6d1;
  --border: #ded1b4;
  --muted: #9a8b70;
  --faint: #b3a488;
  --hover: #e9ddc5;
  --active: #e0d0ae;
  --accent: #96682c;
  --veil: rgba(59, 50, 37, 0.35);
}

html[data-theme='dark'] {
  --bg: #16181b;
  --fg: #c9c7c3;
  --bar: #1d2024;
  --panel: #1a1d21;
  --border: #2e3237;
  --muted: #8d9298;
  --faint: #6f747a;
  --hover: #24282e;
  --active: #2c323a;
  --accent: #d0a05a;
  --veil: rgba(0, 0, 0, 0.5);
}

html,
body,
#app {
  height: 100%;
  margin: 0;
}

body {
  background: var(--bg, #f6f3ec);
  color: var(--fg, #2c2a26);
  -webkit-font-smoothing: antialiased;
}
</style>

<style scoped>
.app {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg, #f6f3ec);
  color: var(--fg, #2c2a26);
  font-family: 'Noto Serif CJK SC', 'Source Han Serif SC', 'Songti SC', SimSun, Georgia, serif;
}

.file-input {
  display: none;
}

.bar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border, #e3ddd0);
  background: var(--bar, #fbf9f4);
  font-size: 14px;
}

/* C2 沉浸模式：工具栏浮在正文上，靠顶 / 靠底才露出来，隐藏时不推挤正文 */
.app.immersive .bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 30;
  transform: translateY(-105%);
  transition: transform 0.16s ease;
}

.app.immersive.reveal-top .bar,
.app.immersive .bar:not(.hidden) {
  transform: none;
}

/* 开着目录 / 排版面板时让工具栏回到正常流里，免得盖住面板 */
.app.immersive.pinned .bar {
  position: static;
  transform: none;
}

.where {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.35;
}

.book-name,
.chapter-name {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.book-name {
  color: var(--muted, #9a9384);
  font-size: 12px;
}

.chapter-name {
  font-weight: 600;
}

button {
  font: inherit;
  cursor: pointer;
}

.nav,
.open,
.primary {
  border: 1px solid var(--border, #ddd6c8);
  border-radius: 6px;
  background: var(--bg, #fff);
  color: var(--fg, #4a463d);
  padding: 4px 12px;
}

.nav:disabled {
  opacity: 0.4;
  cursor: default;
}

.nav:hover:not(:disabled),
.open:hover,
.primary:hover {
  border-color: var(--faint, #c8bfae);
}

.nav.toggler.on {
  background: var(--active, #e2dccc);
  border-color: var(--faint, #c8bfae);
}

.count {
  margin-left: 4px;
  color: var(--muted, #9a9384);
  font-size: 11px;
}

.body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.column {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.reader {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  scroll-behavior: auto;
  /* 窗口补 / 裁章节时，阅读视口自己按锚点元素校正滚动；
     这里关掉浏览器自带的 scroll anchoring 管首屏，视口里还会再设一次，两边不抢 */
  overflow-anchor: none;
}

.page {
  max-width: var(--reader-width, 36em);
  margin: 0 auto;
  padding: 40px 24px 72px;
  font-family: var(--reader-font, inherit);
  font-size: var(--reader-size, 18px);
  line-height: var(--reader-line, 1.9);
}

.chapter + .chapter {
  margin-top: 3em;
  padding-top: 1.5em;
  border-top: 1px solid var(--border, #e3ddd0);
}

.chapter-title {
  margin: 0 0 1.6em;
  font-size: 1.35em;
  font-weight: 600;
  text-align: center;
}

.para {
  margin: 0 0 var(--reader-para-gap, 0.55em);
  text-indent: var(--reader-indent, 2em);
  text-align: justify;
  overflow-wrap: break-word;
}

.tail {
  margin: 2.5em 0 0;
  text-align: center;
}

.end {
  color: var(--faint, #b3ab9c);
  font-size: 0.9em;
}

.status {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  justify-content: center;
  align-items: center;
  padding: 6px 16px;
  border-top: 1px solid var(--border, #e3ddd0);
  background: var(--bar, #fbf9f4);
  color: var(--muted, #9a9384);
  font-size: 12px;
}

.app.immersive .status {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  transform: translateY(105%);
  transition: transform 0.16s ease;
}

.app.immersive.reveal-bottom .status,
.app.immersive .status:not(.hidden) {
  transform: none;
}

.keys {
  color: var(--faint, #b8b1a3);
}

.notice {
  color: var(--accent, #b06a2c);
}

/* 操作反馈：固定浮层，盖在目录 / 排版面板（z-index 40）与书签卡片之上 */
.toast-float {
  position: fixed;
  left: 50%;
  bottom: 64px;
  z-index: 60;
  transform: translateX(-50%);
  max-width: min(560px, 86vw);
  padding: 8px 16px;
  border: 1px solid var(--border, #e3ddd0);
  border-radius: 999px;
  background: var(--bar, #fbf9f4);
  color: var(--fg, #2c2a26);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
  font-size: 13px;
  text-align: center;
}

.center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  text-align: center;
}

.title {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
}

.muted {
  margin: 0;
  color: var(--muted, #9a9384);
}

.fine {
  margin: 8px 0 0;
  max-width: 30em;
  color: var(--muted, #a8a192);
  font-size: 13px;
  line-height: 1.7;
}

.error {
  margin: 0;
  color: var(--accent, #a4442c);
}

.primary {
  padding: 8px 20px;
}

.veil {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--veil, rgba(44, 42, 38, 0.35));
  color: #fff;
  font-size: 20px;
  pointer-events: none;
}

.veil span {
  padding: 24px 40px;
  border: 2px dashed rgba(255, 255, 255, 0.8);
  border-radius: 12px;
}

@media (max-width: 720px) {
  .keys {
    display: none;
  }
}
</style>
