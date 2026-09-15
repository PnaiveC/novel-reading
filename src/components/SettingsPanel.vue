<script setup lang="ts">
import { ENCODING_OPTIONS, type Encoding } from '../core/encoding'
import { FONT_OPTIONS, type ReadingSettings } from '../core/settings'

const props = defineProps<{
  settings: ReadingSettings
  encoding: Encoding
  encodingLabel: string
  canSwitchEncoding: boolean
}>()

const emit = defineEmits<{
  update: [patch: Partial<ReadingSettings>]
  encoding: [value: Encoding]
  reset: []
  close: []
}>()

function number(event: Event): number {
  return Number((event.target as HTMLInputElement).value)
}

function text(event: Event): string {
  return (event.target as HTMLSelectElement).value
}
</script>

<template>
  <section class="panel">
    <div class="row">
      <label class="field">
        <span>字号 {{ props.settings.fontSize }}px</span>
        <input
          type="range"
          min="14"
          max="30"
          step="1"
          :value="props.settings.fontSize"
          @input="emit('update', { fontSize: number($event) })"
        />
      </label>

      <label class="field">
        <span>行距 {{ props.settings.lineHeight.toFixed(2) }}</span>
        <input
          type="range"
          min="1.3"
          max="2.6"
          step="0.05"
          :value="props.settings.lineHeight"
          @input="emit('update', { lineHeight: number($event) })"
        />
      </label>

      <label class="field">
        <span>页宽 {{ props.settings.maxWidth }}em</span>
        <input
          type="range"
          min="24"
          max="60"
          step="1"
          :value="props.settings.maxWidth"
          @input="emit('update', { maxWidth: number($event) })"
        />
      </label>

      <label class="field">
        <span>段间距 {{ props.settings.paragraphSpacing.toFixed(2) }}em</span>
        <input
          type="range"
          min="0"
          max="2"
          step="0.05"
          :value="props.settings.paragraphSpacing"
          @input="emit('update', { paragraphSpacing: number($event) })"
        />
      </label>
    </div>

    <div class="row">
      <label class="field short">
        <span>字体</span>
        <select :value="props.settings.fontFamily" @change="emit('update', { fontFamily: text($event) as ReadingSettings['fontFamily'] })">
          <option v-for="font in FONT_OPTIONS" :key="font.value" :value="font.value">{{ font.label }}</option>
        </select>
      </label>

      <label class="field short">
        <span>首行缩进</span>
        <select
          :value="String(props.settings.indent)"
          @change="emit('update', { indent: Number(text($event)) === 0 ? 0 : 2 })"
        >
          <option value="2">两个字符</option>
          <option value="0">不缩进</option>
        </select>
      </label>

      <label class="field">
        <span>编码（当前 {{ props.encodingLabel }}）</span>
        <select
          :value="props.encoding"
          :disabled="!props.canSwitchEncoding"
          @change="emit('encoding', text($event) as Encoding)"
        >
          <option v-for="item in ENCODING_OPTIONS" :key="item.value" :value="item.value">
            {{ item.label }}
          </option>
        </select>
        <small class="hint">
          {{
            props.canSwitchEncoding
              ? '正文乱码就换一个，阅读位置不变'
              : '本机只缓存了正文，切换编码请重新拖入原文件'
          }}
        </small>
      </label>

      <div class="actions">
        <button @click="emit('reset')">恢复默认</button>
        <button @click="emit('close')">收起</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.panel {
  flex: none;
  padding: 10px 16px 12px;
  border-bottom: 1px solid #e3ddd0;
  background: #fbf9f4;
  color: #6d675c;
  font-size: 12px;
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px 20px;
}

.row + .row {
  margin-top: 8px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 150px;
}

.field.short {
  min-width: 120px;
}

.field input[type='range'] {
  width: 150px;
}

select {
  font: inherit;
  padding: 2px 4px;
  border: 1px solid #ddd6c8;
  border-radius: 4px;
  background: #fff;
  color: inherit;
}

select:disabled {
  opacity: 0.55;
}

.hint {
  color: #a8a192;
}

.actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

button {
  font: inherit;
  padding: 3px 10px;
  border: 1px solid #ddd6c8;
  border-radius: 6px;
  background: #fff;
  color: #4a463d;
  cursor: pointer;
}
</style>
