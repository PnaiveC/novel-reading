import { ref } from 'vue'
import { loadUiPrefs, saveUiPrefs } from '../core/storage'
import { normalizeUiPrefs, type UiPrefs } from '../core/uiPrefs'

/** C2：界面偏好（当前只有沉浸模式），改一下存一下 */
export function useUiPrefs() {
  const prefs = ref<UiPrefs>(loadUiPrefs())

  function update(patch: Partial<UiPrefs>): void {
    prefs.value = normalizeUiPrefs({ ...prefs.value, ...patch })
    saveUiPrefs(prefs.value)
  }

  function toggleImmersive(): void {
    update({ immersive: !prefs.value.immersive })
  }

  return { prefs, update, toggleImmersive }
}
