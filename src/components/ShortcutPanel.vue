<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { SHORTCUT_ACTIONS, keysLabel, type ShortcutActionId, type ShortcutBindings } from '../core/shortcuts'

const props = defineProps<{
  bindings: ShortcutBindings
  apply: (id: ShortcutActionId, key: string) => { ok: boolean; message: string }
}>()

const emit = defineEmits<{ reset: []; close: [] }>()

const recording = ref<ShortcutActionId | null>(null)
const message = ref('')

const groups = computed(() => [
  { title: '翻页与跳转', actions: SHORTCUT_ACTIONS.filter((action) => action.group === 'nav') },
  { title: '面板与视图', actions: SHORTCUT_ACTIONS.filter((action) => action.group === 'panel') },
])

function keysOf(id: ShortcutActionId): string {
  return keysLabel(props.bindings[id] ?? []) || '未设置'
}

function startRecording(id: ShortcutActionId): void {
  recording.value = id
  message.value = '按下想用的键（Esc 取消）'
}

/** 录制时抢在窗口处理器前面把键吃掉，免得改键顺手把目录也翻出来 */
function onKeydown(event: KeyboardEvent): void {
  const target = recording.value
  if (!target) return
  event.preventDefault()
  event.stopPropagation()
  if (event.key === 'Escape') {
    recording.value = null
    message.value = '已取消'
    return
  }
  const result = props.apply(target, event.key)
  message.value = result.message
  if (result.ok) recording.value = null
}

function resetAll(): void {
  emit('reset')
  recording.value = null
  message.value = '已恢复默认键位'
}

onMounted(() => window.addEventListener('keydown', onKeydown, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true))
</script>

<template>
  <div class="mask" @click.self="emit('close')">
    <section class="card shortcuts">
      <header class="head">
        <h2>快捷键</h2>
        <button class="x" title="收起（Esc）" @click="emit('close')">×</button>
      </header>

      <div class="scroll">
        <div v-for="group in groups" :key="group.title" class="group">
          <h3>{{ group.title }}</h3>
          <ul class="list">
            <li v-for="action in group.actions" :key="action.id" class="row">
              <span class="label">{{ action.label }}</span>
              <span class="keys" :class="{ empty: !(props.bindings[action.id] ?? []).length }">
                {{ keysOf(action.id) }}
              </span>
              <button
                class="set"
                :class="{ on: recording === action.id }"
                @click="startRecording(action.id)"
              >
                {{ recording === action.id ? '按键…' : '改' }}
              </button>
            </li>
          </ul>
        </div>

        <p class="fixed">
          固定键位：<kbd>Esc</kbd> 收起面板 · <kbd>F11</kbd> 浏览器自带全屏；光标在输入框里时不抢键。
        </p>
      </div>

      <footer class="foot">
        <span class="message">{{ message }}</span>
        <button class="reset" @click="resetAll">恢复默认</button>
        <button class="done" @click="emit('close')">收起</button>
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
  max-height: min(76vh, 620px);
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

.scroll {
  overflow-y: auto;
  padding: 6px 0 10px;
}

.group h3 {
  margin: 10px 16px 4px;
  color: var(--muted, #9a9384);
  font-size: 12px;
  font-weight: 400;
}

.list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 12px 4px 16px;
}

.label {
  flex: 1;
  min-width: 0;
  font-size: 13px;
}

.keys {
  min-width: 84px;
  text-align: right;
  color: var(--fg, #2c2a26);
  font-size: 13px;
}

.keys.empty {
  color: var(--muted, #9a9384);
}

.set {
  flex: none;
  width: 56px;
  border: 1px solid var(--border, #e3ddd0);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  padding: 2px 0;
  cursor: pointer;
}

.set.on {
  border-color: var(--accent, #b06a2c);
  background: var(--active, #e2dccc);
  color: var(--accent, #b06a2c);
}

.fixed {
  margin: 12px 16px 0;
  color: var(--muted, #9a9384);
  font-size: 12px;
  line-height: 1.7;
}

kbd {
  padding: 0 4px;
  border: 1px solid var(--border, #e3ddd0);
  border-radius: 4px;
  font-family: inherit;
  font-size: 11px;
}

.foot {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px 8px 16px;
  border-top: 1px solid var(--border, #e3ddd0);
}

.message {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--accent, #b06a2c);
  font-size: 12px;
}

.reset,
.done {
  flex: none;
  border: 1px solid var(--border, #e3ddd0);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  padding: 3px 10px;
  cursor: pointer;
}
</style>
