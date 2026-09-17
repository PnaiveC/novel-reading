function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * 最近打开 / 书签列表用的时间：今天只给时分，昨天给「昨天」，更早给日期。
 * 传入 now 是为了测试能固定时间。
 */
export function formatStamp(timestamp: number, now = Date.now()): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return ''
  const then = new Date(timestamp)
  const today = new Date(now)
  const sameDay =
    then.getFullYear() === today.getFullYear() &&
    then.getMonth() === today.getMonth() &&
    then.getDate() === today.getDate()
  if (sameDay) return `${pad(then.getHours())}:${pad(then.getMinutes())}`

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday =
    then.getFullYear() === yesterday.getFullYear() &&
    then.getMonth() === yesterday.getMonth() &&
    then.getDate() === yesterday.getDate()
  if (isYesterday) return '昨天'

  const sameYear = then.getFullYear() === today.getFullYear()
  const date = `${pad(then.getMonth() + 1)}-${pad(then.getDate())}`
  return sameYear ? date : `${then.getFullYear()}-${date}`
}
