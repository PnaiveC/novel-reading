<script setup lang="ts">
import type { Chapter } from '../core/chapterParser'

defineProps<{ chapters: Chapter[]; currentIndex: number }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'select', index: number): void }>()
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <aside class="toc">
      <header>
        <span>目录</span>
        <button class="btn" @click="emit('close')">关闭</button>
      </header>
      <ul>
        <li
          v-for="(chapter, index) in chapters"
          :key="index"
          :class="{ active: index === currentIndex }"
          @click="emit('select', index)"
        >
          {{ chapter.title }}
        </li>
      </ul>
    </aside>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 20;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
}

.toc {
  width: min(320px, 85vw);
  height: 100%;
  background: var(--panel);
  color: var(--fg);
  display: flex;
  flex-direction: column;
}

.toc header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  font-weight: 600;
}

.toc ul {
  list-style: none;
  margin: 0;
  padding: 8px 0;
  overflow-y: auto;
  flex: 1;
}

.toc li {
  padding: 8px 16px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.toc li:hover {
  background: var(--hover);
}

.toc li.active {
  color: var(--accent);
  font-weight: 600;
}
</style>
