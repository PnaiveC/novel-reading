<script setup lang="ts">
import { computed } from 'vue'
import type { BookSummary } from '../core/library'
import { loadProgress } from '../core/storage'
import { formatStamp } from '../core/time'

const props = defineProps<{
  books: readonly BookSummary[]
  currentId?: string
  now?: number
}>()

const emit = defineEmits<{
  open: [id: string]
  remove: [id: string]
  close: []
}>()

function sizeLabel(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

/** 「第 12/237 章 · 全书 18% · 昨天」，进度是按书上一次离开时记的 */
function progressLabel(id: string): string {
  const progress = loadProgress(id)
  if (!progress) return '还没读过'
  const chapter = progress.chapterCount
    ? `第 ${progress.chapterIndex + 1}/${progress.chapterCount} 章`
    : `第 ${progress.chapterIndex + 1} 章`
  return progress.percent === undefined ? chapter : `${chapter} · 全书 ${progress.percent}%`
}

const rows = computed(() =>
  props.books.map((book) => ({
    ...book,
    progress: progressLabel(book.id),
    stamp: formatStamp(book.lastOpenedAt, props.now),
    size: sizeLabel(book.size),
  })),
)
</script>

<template>
  <div class="mask" @click.self="emit('close')">
    <section class="card recent">
      <header class="head">
        <h2>最近打开</h2>
        <button class="x" title="收起（Esc）" @click="emit('close')">×</button>
      </header>

      <p v-if="!rows.length" class="empty">本机还没有书：把 TXT 拖进窗口就有了。</p>

      <ul v-else class="list">
        <li v-for="row in rows" :key="row.id" class="row" :class="{ current: row.id === props.currentId }">
          <button class="open" @click="emit('open', row.id)">
            <span class="name">
              {{ row.name }}
              <span v-if="row.id === props.currentId" class="badge">在读</span>
            </span>
            <span class="meta">{{ row.progress }} · {{ row.stamp }}<template v-if="row.size"> · {{ row.size }}</template></span>
          </button>
          <button class="del" :title="`从本机删掉《${row.name}》`" @click="emit('remove', row.id)">删除</button>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--veil, rgba(44, 42, 38, 0.35));
  padding: 24px;
}

.card {
  width: min(560px, 100%);
  max-height: min(70vh, 560px);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border, #e3ddd0);
  border-radius: 10px;
  background: var(--bar, #fbf9f4);
  color: var(--fg, #2c2a26);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.18);
  overflow: hidden;
}

.head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 10px 16px;
  border-bottom: 1px solid var(--border, #e3ddd0);
}

.head h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.x {
  border: none;
  background: transparent;
  color: var(--muted, #9a9384);
  font-size: 18px;
  line-height: 1;
  padding: 2px 6px;
  cursor: pointer;
}

.empty {
  margin: 0;
  padding: 24px 16px;
  color: var(--muted, #9a9384);
  font-size: 13px;
  text-align: center;
}

.list {
  margin: 0;
  padding: 6px 0;
  list-style: none;
  overflow-y: auto;
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 10px 2px 6px;
}

.row.current {
  background: var(--active, #e2dccc);
}

.open {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  border: none;
  background: transparent;
  padding: 8px 10px;
  text-align: left;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.name {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}

.badge {
  flex: none;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--panel, #f4f1e9);
  color: var(--muted, #9a9384);
  font-size: 11px;
}

.meta {
  color: var(--muted, #9a9384);
  font-size: 12px;
}

.del {
  flex: none;
  border: 1px solid var(--border, #e3ddd0);
  border-radius: 6px;
  background: transparent;
  color: var(--muted, #9a9384);
  font: inherit;
  font-size: 12px;
  padding: 3px 8px;
  cursor: pointer;
}

.del:hover {
  border-color: var(--accent, #b06a2c);
  color: var(--accent, #b06a2c);
}
</style>
