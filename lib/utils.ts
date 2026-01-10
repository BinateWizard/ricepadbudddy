import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Format timestamps into human-readable "time ago" strings
export function formatTimeAgo(ts?: number) {
  if (!ts) return 'Never'
  const now = Date.now()
  const diff = now - (ts < 1e11 ? ts * 1000 : ts)
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'Just now'
  if (min < 60) return `${min}m ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h ago`
  
  // Show date if 24+ hours old
  const date = new Date(ts < 1e11 ? ts * 1000 : ts)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}


