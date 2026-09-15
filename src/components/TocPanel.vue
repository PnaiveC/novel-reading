<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { Chapter } from '../core/chapterParser'

const props = defineProps<{
  chapters: readonly Chapter[]
  current: number
  bookName?: string
}>()

const emit = defineEmits<{ pick: [index: number]; close: [] }>()

const listEl = ref<HTMLElement | null>(null)

/** 目录很长时，打开就把当前章节滚进视野 */
async function revealCurrent(): Promise<void> {
  await nextTick()
  const active = listEl.value?.querySelector<HTMLElement>('.active')
  active?.scrollIntoView?.({ block: 'nearest' })
}

watch(() => props.current, () => void revealCurrent(), { immediate: true })
</script>

<template>
  <aside class="toc">
    <header class="toc-head">
      <span class="toc-book" :title="props.bookName">{{ props.bookName || '目录' }}</span>
      <button class="toc-close" title="收起目录（Esc）" @click="emit('close')">×</button>
    </header>
    <ol ref="listEl" class="toc-list">
      <li v-for="(item, index) in props.chapters" :key="index">
        <button
          class="toc-item"
          :class="{ active: index === props.current }"
          :title="item.title"
          @click="emit('pick', index)"
        >
          <span class="toc-num">{{ index + 1 }}</span>
          <span class="toc-name">{{ item.title }}</span>
        </button>
      </li>
    </ol>
    <footer class="toc-foot">共 {{ props.chapters.length }} 章</footer>
  </aside>
</template>

<style scoped>
.toc {
  flex: none;
  width: 260px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #e3ddd0;
  background: #f4f1e9;
  min-height: 0;
}

.toc-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 8px 8px 12px;
  border-bottom: 1px solid #e3ddd0;
}

.toc-book {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #6d675c;
  font-size: 13px;
}

.toc-close {
  border: none;
  background: transparent;
  color: #8b8477;
  font-size: 18px;
  line-height: 1;
  padding: 2px 6px;
  cursor: pointer;
}

.toc-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin: 0;
  padding: 6px 0;
  list-style: none;
}

.toc-item {
  display: flex;
  gap: 8px;
  width: 100%;
  border: none;
  background: transparent;
  padding: 6px 12px;
  text-align: left;
  color: #4a463d;
  font-size: 13px;
  line-height: 1.4;
  cursor: pointer;
}

.toc-item:hover {
  background: #ebe6da;
}

.toc-item.active {
  background: #e2dccc;
  font-weight: 600;
}

.toc-num {
  flex: none;
  width: 2.4em;
  color: #a8a192;
  text-align: right;
}

.toc-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toc-foot {
  flex: none;
  padding: 6px 12px;
  border-top: 1px solid #e3ddd0;
  color: #a8a192;
  font-size: 12px;
}

@media (max-width: 720px) {
  .toc {
    width: 200px;
  }
}
</style>
