/**
 * Shared utility functions for PaySplit Frontend.
 * Rules: FRONTEND_ARCHITECTURE.md
 */

/**
 * Returns a human-readable "time ago" string.
 */
export function timeAgo(date: string | Date | number): string {
  const now = new Date().getTime()
  const past = new Date(date).getTime()
  const diff = now - past

  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return 'Just now'
}
