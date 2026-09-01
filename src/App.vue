<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { decodeText, detectEncoding, type Encoding } from './core/encoding'
import { parseChapters, type Chapter } from './core/chapterParser'
import {
  fileKey,
  loadProgress,
  loadSettings,
  saveProgress,
  saveSettings,
  type ReadingSettings,
} from './core/storage'
import FileDrop from './components/FileDrop.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import TocPanel from './components/TocPanel.vue'

const chapters = ref<Chapter[]>([])
const bytes = ref<Uint8Array | null>(null)
const currentIndex = ref(0)
const encoding = ref<'auto' | Encoding>('auto')
const file = ref<{ name: string; size: number; key: string } | null>(null)
const error = ref('')
const tocOpen = ref(false)
const settingsOpen = ref(false)

const settings = reactive<ReadingSettings>(loadSettings() ?? {
  fontSize: 18,
  lineHeight: 1.8,
  maxWidth: 42,
  theme: 'sepia',
})

watch(settings, (value) => saveSettings({ ...value }), { deep: true })

const currentChapter = computed(() => chapters.value[currentIndex.value] ?? null)
const paragraphs = computed(() =>
  (currentChapter.value?.content ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean),
)
const readerStyle = computed(() => ({
  '--reader-font-size': `${settings.fontSize}px`,
  '--reader-line-height': String(settings.lineHeight),
  '--reader-max-width': `${settings.maxWidth}ch`,
}))

function onInputChange(event: Event) {
  const input = event.target as HTMLInputElement
  const selected = input.files?.[0]
  if (selected) void loadFile(selected)
  input.value = ''
}

function onFileSelected(f: File) {
  error.value = ''
  if (!/\.txt$/i.test(f.name) && f.type !== 'text/plain') {
    error.value = '请选择 TXT 文本文件'
    return
  }
  void loadFile(f)
}

async function loadFile(f: File) {
  try {
    const buf = new Uint8Array(await f.arrayBuffer())
    const detected = detectEncoding(buf)
    bytes.value = buf
    chapters.value = parseChapters(decodeText(buf, encoding.value === 'auto' ? detected : encoding.value))
    file.value = { name: f.name, size: f.size, key: fileKey(f.name, f.size) }
    const saved = loadProgress(file.value.key)
    currentIndex.value = saved ? Math.min(saved.chapterIndex, chapters.value.length - 1) : 0
  } catch (err) {
    error.value = `文件读取失败：${err instanceof Error ? err.message : String(err)}`
  }
}

function applyEncoding(value: 'auto' | Encoding) {
  encoding.value = value
  if (!bytes.value) return
  const detected = detectEncoding(bytes.value)
  chapters.value = parseChapters(decodeText(bytes.value, value === 'auto' ? detected : value))
  currentIndex.value = Math.min(currentIndex.value, chapters.value.length - 1)
}

function selectChapter(index: number) {
  currentIndex.value = index
  tocOpen.value = false
}

function prevChapter() {
  if (currentIndex.value > 0) currentIndex.value -= 1
}

function nextChapter() {
  if (currentIndex.value < chapters.value.length - 1) currentIndex.value += 1
}

watch([currentIndex, file], () => {
  if (file.value) {
    saveProgress(file.value.key, { chapterIndex: currentIndex.value, updatedAt: Date.now() })
  }
})
</script>

<template>
  <main class="app" :class="`theme-${settings.theme}`" :style="readerStyle">
    <header class="topbar">
      <h1>小说阅读器</h1>
      <div class="actions">
        <label class="btn">
          打开 TXT
          <input type="file" accept=".txt,text/plain" hidden @change="onInputChange" />
        </label>
        <button class="btn" :disabled="!chapters.length" @click="tocOpen = true">目录</button>
        <button class="btn" @click="settingsOpen = true">设置</button>
      </div>
    </header>

    <p v-if="error" class="error">{{ error }}</p>

    <FileDrop v-if="!chapters.length" @file="onFileSelected" />

    <section v-else class="reader">
      <div class="file-meta" v-if="file">{{ file.name }}</div>
      <h2 class="chapter-title">{{ currentChapter?.title }}</h2>
      <div class="chapter-body">
        <p v-for="(paragraph, index) in paragraphs" :key="index">{{ paragraph }}</p>
      </div>
      <nav class="pager">
        <button class="btn" :disabled="currentIndex === 0" @click="prevChapter">上一章</button>
        <span>{{ currentIndex + 1 }} / {{ chapters.length }}</span>
        <button class="btn" :disabled="currentIndex === chapters.length - 1" @click="nextChapter">
          下一章
        </button>
      </nav>
    </section>

    <TocPanel
      v-if="tocOpen"
      :chapters="chapters"
      :current-index="currentIndex"
      @close="tocOpen = false"
      @select="selectChapter"
    />
    <SettingsPanel
      v-if="settingsOpen"
      :settings="settings"
      v-model="encoding"
      @close="settingsOpen = false"
      @update:encoding="applyEncoding"
    />
  </main>
</template>

<style scoped>
.app {
  --bg: #f7f5f0;
  --fg: #2b2b2b;
  --muted: #8a8378;
  --panel: #ffffff;
  --border: #d8d2c6;
  --hover: #f0ece3;
  --accent: #8a6d3b;
  min-height: 100vh;
  margin: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  color: var(--fg);
  font-family: 'Songti SC', 'Noto Serif CJK SC', 'Source Han Serif SC', serif;
}

.app.theme-sepia {
  --bg: #f4ecd8;
  --fg: #5b4636;
  --muted: #9b8968;
  --panel: #faf3e3;
  --border: #d9c9a8;
  --hover: #efe4c8;
  --accent: #8a6d3b;
}

.app.theme-dark {
  --bg: #1e1e1e;
  --fg: #d4d4d4;
  --muted: #888888;
  --panel: #262626;
  --border: #3a3a3a;
  --hover: #303030;
  --accent: #d0a85c;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--panel);
}

.topbar h1 {
  font-size: 18px;
  margin: 0;
}

.actions {
  display: flex;
  gap: 8px;
}

.btn {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--fg);
  padding: 6px 12px;
  font-size: 14px;
  cursor: pointer;
}

.btn:hover:not(:disabled) {
  background: var(--hover);
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.error {
  margin: 12px 20px 0;
  padding: 10px 14px;
  border: 1px solid #c0392b;
  border-radius: 6px;
  background: rgba(192, 57, 43, 0.1);
  color: #c0392b;
}

.reader {
  flex: 1;
  margin: 0 auto;
  padding: 24px 20px 48px;
  width: 100%;
  box-sizing: border-box;
  max-width: var(--reader-max-width);
}

.file-meta {
  color: var(--muted);
  font-size: 13px;
  margin-bottom: 8px;
}

.chapter-title {
  font-size: calc(var(--reader-font-size) + 6px);
  margin: 0 0 20px;
  text-align: center;
}

.chapter-body {
  font-size: var(--reader-font-size);
  line-height: var(--reader-line-height);
}

.chapter-body p {
  margin: 0 0 1em;
  text-indent: 2em;
}

.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 32px;
  color: var(--muted);
}
</style>
