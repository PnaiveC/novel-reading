<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { Chapter } from '../core/chapterParser'
import { clampTocWidth } from '../core/uiPrefs'

const props = defineProps<{
  chapters: readonly Chapter[]
  current: number
  bookName?: string
  /** 目录栏宽度（像素） */
  width: number
}>()

const emit = defineEmits<{
  pick: [index: number]
  close: []
  resize: [width: number]
  resizeEnd: [width: number]
}>()

const listEl = ref<HTMLElement | null>(null)

/** 目录很长时，打开就把当前章节滚进视野 */
async function revealCurrent(): Promise<void> {
  await nextTick()
  const active = listEl.value?.querySelector<HTMLElement>('.active')
  active?.scrollIntoView?.({ block: 'nearest' })
}

watch(() => props.current, () => void revealCurrent(), { immediate: true })

/** 拖右边缘改宽度：拖动中实时跟手，松手才落盘（由界面负责存） */
function startDrag(event: MouseEvent): void {
  event.preventDefault()
  const startX = event.clientX
  const startWidth = props.width
  let latest = clampTocWidth(startWidth)

  const onMove = (move: MouseEvent): void => {
    latest = clampTocWidth(startWidth + (move.clientX - startX))
    emit('resize', latest)
  }
  const onUp = (): void => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    emit('resizeEnd', latest)
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}
</script>

<template>
  <aside class="toc" :style="{ width: `${props.width}px` }">
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
    <div
      class="toc-resizer"
      title="拖动调整目录宽度"
      role="separator"
      aria-orientation="vertical"
      @mousedown="startDrag"
    ></div>
  </aside>
</template>

<style scoped>
.toc {
  position: relative;
  flex: none;
  width: 260px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border, #e3ddd0);
  background: var(--panel, #f4f1e9);
  min-height: 0;
}

/* 目录右边缘：按住拖动改宽度 */
.toc-resizer {
  position: absolute;
  top: 0;
  right: -3px;
  width: 7px;
  height: 100%;
  cursor: col-resize;
}

.toc-resizer:hover {
  background: var(--border, #e3ddd0);
}

.toc-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 8px 8px 12px;
  border-bottom: 1px solid var(--border, #e3ddd0);
}

.toc-book {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--fg, #6d675c);
  font-size: 13px;
}

.toc-close {
  border: none;
  background: transparent;
  color: var(--muted, #8b8477);
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
  color: var(--fg, #4a463d);
  font-size: 13px;
  line-height: 1.4;
  cursor: pointer;
}

.toc-item:hover {
  background: var(--hover, #ebe6da);
}

.toc-item.active {
  background: var(--active, #e2dccc);
  font-weight: 600;
}

.toc-num {
  flex: none;
  width: 2.4em;
  color: var(--muted, #a8a192);
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
  border-top: 1px solid var(--border, #e3ddd0);
  color: var(--muted, #a8a192);
  font-size: 12px;
}

</style>
