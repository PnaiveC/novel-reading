<script setup lang="ts">
import { ENCODING_LABELS, type Encoding } from '../core/encoding'
import type { ReadingSettings } from '../core/storage'

defineProps<{ settings: ReadingSettings }>()
const encoding = defineModel<'auto' | Encoding>({ default: 'auto' })
const emit = defineEmits<{ (e: 'close'): void }>()

const themeOptions = [
  { value: 'light', label: '浅色' },
  { value: 'sepia', label: '护眼' },
  { value: 'dark', label: '夜间' },
] as const
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <aside class="panel">
      <header>
        <span>阅读设置</span>
        <button class="btn" @click="emit('close')">关闭</button>
      </header>
      <div class="row">
        <label>字号 <span>{{ settings.fontSize }}px</span></label>
        <input type="range" min="14" max="28" v-model.number="settings.fontSize" />
      </div>
      <div class="row">
        <label>行距 <span>{{ settings.lineHeight }}</span></label>
        <input type="range" min="1.4" max="2.4" step="0.1" v-model.number="settings.lineHeight" />
      </div>
      <div class="row">
        <label>页宽 <span>{{ settings.maxWidth }} 字</span></label>
        <input type="range" min="34" max="52" v-model.number="settings.maxWidth" />
      </div>
      <div class="row">
        <label>主题</label>
        <select v-model="settings.theme">
          <option v-for="option in themeOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </div>
      <div class="row">
        <label>编码</label>
        <select v-model="encoding">
          <option value="auto">自动检测</option>
          <option v-for="(label, value) in ENCODING_LABELS" :key="value" :value="value">
            {{ label }}
          </option>
        </select>
      </div>
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
  justify-content: flex-end;
}

.panel {
  width: min(340px, 90vw);
  height: 100%;
  background: var(--panel);
  color: var(--fg);
  padding: 0 16px 16px;
  box-sizing: border-box;
}

.panel header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--border);
  font-weight: 600;
}

.row {
  margin-top: 16px;
}

.row label {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
}

.row span {
  color: var(--muted);
}

.row input[type='range'],
.row select {
  width: 100%;
}
</style>
