import { useEffect, useRef } from 'react'

interface Props {
  message: string | null
  onDone: () => void
}

export function Toast({ message, onDone }: Props) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (!message) return
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(onDone, 3200)
    return () => clearTimeout(timerRef.current)
  }, [message, onDone])

  if (!message) return null

  return (
    <div className="glass toast" role="status">
      {message}
    </div>
  )
}
