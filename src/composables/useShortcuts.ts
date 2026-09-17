import { ref } from 'vue'
import {
  actionForKey,
  findAction,
  keyLabel,
  keysLabel,
  normalizeShortcuts,
  rebindShortcut,
  type ShortcutActionId,
  type ShortcutBindings,
} from '../core/shortcuts'
import { loadShortcuts, saveShortcuts } from '../core/storage'

export interface ShortcutChangeResult {
  ok: boolean
  message: string
}

/**
 * C3 快捷键：默认键位 + 自己改键，改完立刻落盘，下次打开还是这套。
 */
export function useShortcuts() {
  const bindings = ref<ShortcutBindings>(loadShortcuts())

  function setKey(id: ShortcutActionId, key: string): ShortcutChangeResult {
    const action = findAction(id)
    const result = rebindShortcut(bindings.value, id, key)
    if (!result.ok) {
      return {
        ok: false,
        message: result.conflictLabel
          ? `${keyLabel(key)} 已经是「${result.conflictLabel}」的键`
          : '这个键不能用',
      }
    }
    bindings.value = normalizeShortcuts(result.bindings)
    saveShortcuts(bindings.value)
    return { ok: true, message: `「${action?.label ?? id}」改成 ${keysLabel(bindings.value[id])}` }
  }

  function reset(): void {
    bindings.value = normalizeShortcuts(null)
    saveShortcuts(bindings.value)
  }

  function match(event: KeyboardEvent): ShortcutActionId | null {
    return actionForKey(bindings.value, event.key)
  }

  function hint(id: ShortcutActionId): string {
    return keysLabel(bindings.value[id] ?? [])
  }

  return { bindings, setKey, reset, match, hint }
}
