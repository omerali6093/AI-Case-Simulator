export const REACTIONS = {
  high: 'That makes sense. Thank you, doctor. I feel much clearer about what to do now.',
  mid: 'Okay... I suppose that could work. Is there anything else I should keep an eye on?',
  low: "Hmm. I'm not sure that's the right plan. I might ask for a second opinion.",
}

export const QUESTIONS_PER_CASE = 4

export function rating(score: number): string {
  if (score >= 80) return 'Strong choice'
  if (score >= 50) return 'Partly appropriate'
  return 'Needs review'
}

export function stars(score: number): number {
  if (score >= 80) return 3
  if (score >= 50) return 2
  return 1
}

export function uuid(): string {
  return window.crypto?.randomUUID?.() ??
    Date.now().toString(16) + '-' + Math.random().toString(16).slice(2) + '-' + Math.random().toString(16).slice(2)
}

const SESSION_KEY = 'clinic-sim-session-v3'

export function loadLastUser(): string | null {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null')
    return saved?.last ?? null
  } catch {
    return null
  }
}

export function saveLastUser(username: string): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ last: username }))
  } catch { /* storage is optional */ }
}
