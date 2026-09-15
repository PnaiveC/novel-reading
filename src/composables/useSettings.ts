import { ref } from 'vue'
import { DEFAULT_SETTINGS, normalizeSettings, type ReadingSettings } from '../core/settings'
import { loadSettings, saveSettings } from '../core/storage'

/**
 * 阅读排版设置（B4）：改一下存一下，下次打开还是这套。
 * C3「设置持久化」与 B4 共用这条链路，不再单独做。
 */
export function useSettings() {
  const settings = ref<ReadingSettings>(loadSettings() ?? DEFAULT_SETTINGS)

  function update(patch: Partial<ReadingSettings>): void {
    settings.value = normalizeSettings({ ...settings.value, ...patch })
    saveSettings(settings.value)
  }

  function reset(): void {
    update(DEFAULT_SETTINGS)
  }

  return { settings, update, reset }
}
