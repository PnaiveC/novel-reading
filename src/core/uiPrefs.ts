/** 界面偏好（C2）：和排版设置分开存，免得读版式的旧数据里混进界面状态 */
export interface UiPrefs {
  /** 沉浸模式：平时只剩正文，鼠标靠近顶部 / 底部才露工具栏 */
  immersive: boolean
}

export const DEFAULT_UI_PREFS: UiPrefs = { immersive: false }

export function normalizeUiPrefs(input: unknown): UiPrefs {
  const source = (input ?? {}) as Partial<UiPrefs>
  return { immersive: source.immersive === true }
}
