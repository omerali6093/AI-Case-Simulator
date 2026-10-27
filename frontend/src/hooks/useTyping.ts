import { useCallback, useRef, useState } from 'react'

const reduceMotion =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const CPS = reduceMotion ? 1e6 : 44   // characters per second

export interface TypingHandle {
  skip: () => void
}

/**
 * Returns { vis, hid, thinking } reactive state that drives the bubble animation.
 * `start(text)` returns a Promise that resolves when typing finishes.
 * `skip()` immediately completes the current animation.
 */
export function useTyping() {
  const [vis, setVis] = useState('')
  const [hid, setHid] = useState('')
  const [thinking, setThinking] = useState(false)
  const rafRef = useRef<number>(0)
  const resolveRef = useRef<(() => void) | null>(null)
  const textRef = useRef('')
  const startTimeRef = useRef(0)

  const finish = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    setVis(textRef.current)
    setHid('')
    setThinking(false)
    resolveRef.current?.()
    resolveRef.current = null
  }, [])

  const skip = useCallback(() => {
    if (resolveRef.current) finish()
  }, [finish])

  const startTyping = useCallback(
    (text: string, onSpeaking: (on: boolean) => void): Promise<void> => {
      // cancel any in-progress typing
      cancelAnimationFrame(rafRef.current)
      resolveRef.current?.()
      resolveRef.current = null

      textRef.current = text
      setVis('')
      setHid(text)
      setThinking(true)
      onSpeaking(true)

      return new Promise<void>((resolve) => {
        resolveRef.current = () => {
          onSpeaking(false)
          resolve()
        }

        const delay = reduceMotion ? 0 : 380
        startTimeRef.current = performance.now() + delay

        const tick = (now: number) => {
          const n = Math.floor((Math.max(0, now - startTimeRef.current) / 1000) * CPS)
          if (now >= startTimeRef.current) setThinking(false)
          if (n >= text.length) {
            finish()
            return
          }
          setVis(text.slice(0, n))
          setHid(text.slice(n))
          rafRef.current = requestAnimationFrame(tick)
        }
        rafRef.current = requestAnimationFrame(tick)
      })
    },
    [finish]
  )

  return { vis, hid, thinking, startTyping, skip }
}
