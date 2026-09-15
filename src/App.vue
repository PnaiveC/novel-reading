<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import SettingsPanel from './components/SettingsPanel.vue'
import TocPanel from './components/TocPanel.vue'
import { pickAnchorIndex } from './core/anchor'
import type { Encoding } from './core/encoding'
import type { Library } from './core/library'
import { FONT_STACKS } from './core/settings'
import { useReader } from './composables/useReader'
import { useSettings } from './composables/useSettings'

const props = defineProps<{ library?: Library }>()

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
  paragraphs,
  hasPrev,
  hasNext,
  chapterLabel,
  encoding,
  encodingLabel,
  canSwitchEncoding,
  openFile,
  restoreLastBook,
  rememberPosition,
  setEncoding,
  goToChapter,
  nextChapter,
  prevChapter,
} = useReader({ library: props.library })

const { settings, update: updateSettings, reset: resetSettings } = useSettings()

const scrollEl = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const dragging = ref(false)
const tocOpen = ref(false)
const settingsOpen = ref(false)

/** 排版设置落到 CSS 变量（B4）：改一下立刻生效，不用重建正文 */
const readerStyle = computed(() => ({
  '--reader-font': FONT_STACKS[settings.value.fontFamily],
  '--reader-size': `${settings.value.fontSize}px`,
  '--reader-line': String(settings.value.lineHeight),
  '--reader-width': `${settings.value.maxWidth}em`,
  '--reader-para-gap': `${settings.value.paragraphSpacing}em`,
  '--reader-indent': `${settings.value.indent}em`,
}))

/** 恢复滚动期间不要把中间态当成用户位置写进进度 */
let restoring = false
let frame = 0

function paragraphNodes(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-p]'))
}

function capturePosition(): number {
  const container = scrollEl.value
  if (!container) return anchorIndex.value
  const nodes = paragraphNodes(container)
  if (!nodes.length) return 0
  const viewportTop = container.getBoundingClientRect().top
  const bottoms = nodes.map((node) => node.getBoundingClientRect().bottom)
  return pickAnchorIndex(bottoms, viewportTop)
}

async function restoreScroll(): Promise<void> {
  await nextTick()
  const container = scrollEl.value
  if (!container) return
  const node = paragraphNodes(container)[anchorIndex.value]
  restoring = true
  container.scrollTop = node
    ? node.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop
    : 0
  requestAnimationFrame(() => {
    restoring = false
  })
}

function flushPosition(): void {
  if (book.value) rememberPosition(capturePosition())
}

function onScroll(): void {
  if (restoring || frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    flushPosition()
  })
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'hidden') flushPosition()
}

/** 翻一页（B5）：按视口高度的九成滚，留一点上一屏的尾巴不至于跳读 */
function turnPage(direction: 1 | -1): void {
  const container = scrollEl.value
  if (!container) return
  container.scrollTop += direction * Math.max(80, Math.round(container.clientHeight * 0.9))
}

function scrollToChapterStart(): void {
  if (scrollEl.value) scrollEl.value.scrollTop = 0
}

function scrollToChapterEnd(): void {
  const container = scrollEl.value
  if (container) container.scrollTop = container.scrollHeight
}

function onKeydown(event: KeyboardEvent): void {
  if (status.value !== 'reading') return
  const target = event.target as HTMLElement | null
  if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
  if (event.altKey || event.ctrlKey || event.metaKey) return

  switch (event.key) {
    case 'ArrowLeft':
      event.preventDefault()
      prevChapter()
      break
    case 'ArrowRight':
      event.preventDefault()
      nextChapter()
      break
    case ' ':
    case 'PageDown':
      event.preventDefault()
      turnPage(1)
      break
    case 'PageUp':
      event.preventDefault()
      turnPage(-1)
      break
    case 'Home':
      event.preventDefault()
      scrollToChapterStart()
      break
    case 'End':
      event.preventDefault()
      scrollToChapterEnd()
      break
    case 'Escape':
      tocOpen.value = false
      settingsOpen.value = false
      break
    default:
      break
  }
}

function onEncodingChange(value: Encoding): void {
  void setEncoding(value)
}

watch([() => book.value?.id, chapterIndex, revision], () => {
  void restoreScroll()
})

watch(chapters, () => {
  const last = Math.max(0, chapters.value.length - 1)
  if (chapterIndex.value > last) chapterIndex.value = last
})

onMounted(() => {
  window.addEventListener('beforeunload', flushPosition)
  window.addEventListener('keydown', onKeydown)
  document.addEventListener('visibilitychange', onVisibilityChange)
  void restoreLastBook()
})

onBeforeUnmount(() => {
  if (frame) cancelAnimationFrame(frame)
  window.removeEventListener('beforeunload', flushPosition)
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('visibilitychange', onVisibilityChange)
})

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
</script>

<template>
  <div
    class="app"
    :style="readerStyle"
    @dragover.prevent="dragging = true"
    @dragleave="dragging = false"
    @drop.prevent="onDrop"
  >
    <input
      ref="fileInput"
      class="file-input"
      type="file"
      accept=".txt,text/plain"
      @change="onPick"
    />

    <template v-if="status === 'reading'">
      <header class="bar">
        <button
          class="nav toggler"
          :class="{ on: tocOpen }"
          title="目录（Esc 收起）"
          @click="tocOpen = !tocOpen"
        >
          目录
        </button>
        <button class="nav" :disabled="!hasPrev" title="上一章（←）" @click="prevChapter()">上一章</button>
        <button class="nav" :disabled="!hasNext" title="下一章（→）" @click="nextChapter()">下一章</button>
        <div class="where">
          <span class="book-name">{{ book?.name }}</span>
          <span class="chapter-name">{{ chapter?.title }}</span>
        </div>
        <button
          class="nav toggler"
          :class="{ on: settingsOpen }"
          title="排版与编码"
          @click="settingsOpen = !settingsOpen"
        >
          排版
        </button>
        <button class="open" @click="openPicker">换一本</button>
      </header>

      <div class="body">
        <TocPanel
          v-if="tocOpen"
          :chapters="chapters"
          :current="chapterIndex"
          :book-name="book?.name"
          @pick="goToChapter"
          @close="tocOpen = false"
        />

        <div class="column">
          <SettingsPanel
            v-if="settingsOpen"
            :settings="settings"
            :encoding="encoding"
            :encoding-label="encodingLabel"
            :can-switch-encoding="canSwitchEncoding"
            @update="updateSettings"
            @encoding="onEncodingChange"
            @reset="resetSettings"
            @close="settingsOpen = false"
          />

          <main ref="scrollEl" class="reader" @scroll.passive="onScroll">
            <article class="page">
              <h1 class="chapter-title">{{ chapter?.title }}</h1>
              <p v-for="(textItem, index) in paragraphs" :key="index" :data-p="index" class="para">
                {{ textItem }}
              </p>
              <p class="tail">
                <button v-if="hasNext" class="nav" @click="nextChapter()">下一章 →</button>
                <span v-else class="end">— 全书完 —</span>
              </p>
            </article>
          </main>

          <footer class="status">
            <span class="pos">{{ chapterLabel }}</span>
            <span class="keys">← → 翻章 · 空格 / PageDown 翻页 · Home / End 章首末</span>
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
      <p class="fine">单文件、断网可用；打开过的书留在本机，下次打开自动回到上次读到的位置。</p>
    </section>

    <div v-if="dragging" class="veil"><span>松手即打开</span></div>
  </div>
</template>

<style>
html,
body,
#app {
  height: 100%;
  margin: 0;
}

body {
  background: #f6f3ec;
  -webkit-font-smoothing: antialiased;
}
</style>

<style scoped>
.app {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f6f3ec;
  color: #2c2a26;
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
  border-bottom: 1px solid #e3ddd0;
  background: #fbf9f4;
  font-size: 14px;
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
  color: #9a9384;
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
  border: 1px solid #ddd6c8;
  border-radius: 6px;
  background: #fff;
  color: #4a463d;
  padding: 4px 12px;
}

.nav:disabled {
  opacity: 0.4;
  cursor: default;
}

.nav:hover:not(:disabled),
.open:hover,
.primary:hover {
  border-color: #c8bfae;
}

.nav.toggler.on {
  background: #e2dccc;
  border-color: #c8bfae;
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
}

.page {
  max-width: var(--reader-width, 36em);
  margin: 0 auto;
  padding: 40px 24px 72px;
  font-family: var(--reader-font, inherit);
  font-size: var(--reader-size, 18px);
  line-height: var(--reader-line, 1.9);
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
  color: #b3ab9c;
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
  border-top: 1px solid #e3ddd0;
  background: #fbf9f4;
  color: #9a9384;
  font-size: 12px;
}

.keys {
  color: #b8b1a3;
}

.notice {
  color: #b06a2c;
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
  color: #9a9384;
}

.fine {
  margin: 8px 0 0;
  max-width: 30em;
  color: #a8a192;
  font-size: 13px;
  line-height: 1.7;
}

.error {
  margin: 0;
  color: #a4442c;
}

.primary {
  padding: 8px 20px;
}

.veil {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(44, 42, 38, 0.35);
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
