<script setup lang="ts">
import type { Bookmark } from '../core/bookmarks'
import { formatStamp } from '../core/time'

const props = defineProps<{
  bookmarks: readonly Bookmark[]
  bookName?: string
  now?: number
}>()

const emit = defineEmits<{
  pick: [bookmark: Bookmark]
  add: []
  remove: [id: string]
  close: []
}>()

function stamp(createdAt: number): string {
  return formatStamp(createdAt, props.now)
}
</script>

<template>
  <div class="mask" @click.self="emit('close')">
    <section class="card bookmarks">
      <header class="head">
        <h2>书签<span v-if="props.bookName" class="book">· {{ props.bookName }}</span></h2>
        <button class="x" title="收起（Esc）" @click="emit('close')">×</button>
      </header>

      <p v-if="!props.bookmarks.length" class="empty">
        还没有书签：读到想记的地方按 A，或点下面的「加书签」。
      </p>

      <ul v-else class="list">
        <li v-for="item in props.bookmarks" :key="item.id" class="row">
          <button class="open" @click="emit('pick', item)">
            <span class="where">
              <span class="chapter">{{ item.chapterTitle || `第 ${item.chapterIndex + 1} 章` }}</span>
              <span class="stamp">{{ stamp(item.createdAt) }}</span>
            </span>
            <span class="excerpt">{{ item.excerpt || '（这一段没有可显示的正文）' }}</span>
          </button>
          <button class="del" title="删掉这条书签" @click="emit('remove', item.id)">删除</button>
        </li>
      </ul>

      <footer class="foot">
        <span class="count">
          {{ props.bookmarks.length ? `共 ${props.bookmarks.length} 条 · 点一条就跳过去` : '按当前位置记一个' }}
        </span>
        <button class="add" @click="emit('add')">加书签</button>
      </footer>
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
  gap: 8px;
  padding: 10px 12px 10px 16px;
  border-bottom: 1px solid var(--border, #e3ddd0);
}

.head h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.book {
  color: var(--muted, #9a9384);
  font-weight: 400;
}

.x {
  flex: none;
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

.open:hover {
  background: var(--hover, #ebe6da);
}

.where {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
}

.chapter {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stamp {
  flex: none;
  color: var(--muted, #9a9384);
  font-size: 12px;
}

.excerpt {
  color: var(--muted, #9a9384);
  font-size: 12px;
  line-height: 1.5;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
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

.foot {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  border-top: 1px solid var(--border, #e3ddd0);
  color: var(--muted, #9a9384);
  font-size: 12px;
}

.count {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.add {
  flex: none;
  border: 1px solid var(--border, #e3ddd0);
  border-radius: 6px;
  background: transparent;
  color: var(--fg, #2c2a26);
  font: inherit;
  font-size: 12px;
  padding: 3px 10px;
  cursor: pointer;
}
</style>
