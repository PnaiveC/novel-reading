<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{ (e: 'file', file: File): void }>()

const input = ref<HTMLInputElement | null>(null)
const dragging = ref(false)

function onPick() {
  input.value?.click()
}

function onInputChange(event: Event) {
  const el = event.target as HTMLInputElement
  const file = el.files?.[0]
  if (file) emit('file', file)
  el.value = ''
}

function onDrop(event: DragEvent) {
  dragging.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) emit('file', file)
}
</script>

<template>
  <div
    class="file-drop"
    :class="{ dragging }"
    role="button"
    tabindex="0"
    @click="onPick"
    @keydown.enter="onPick"
    @dragover.prevent="dragging = true"
    @dragleave.prevent="dragging = false"
    @drop.prevent="onDrop"
  >
    <input ref="input" type="file" accept=".txt,text/plain" hidden @change="onInputChange" />
    <p class="title">点击选择 TXT 文件</p>
    <p class="hint">或将文件拖拽到此处</p>
  </div>
</template>

<style scoped>
.file-drop {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin: 24px;
  border: 2px dashed var(--border);
  border-radius: 12px;
  color: var(--muted);
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}

.file-drop:hover,
.file-drop.dragging {
  border-color: var(--accent);
  background: var(--panel);
}

.title {
  font-size: 20px;
  color: var(--fg);
  margin: 0 0 8px;
}

.hint {
  margin: 0;
}
</style>
