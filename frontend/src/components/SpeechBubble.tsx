import { useCallback } from 'react'
import type { WorldAnchors } from '../types'
import { useTyping } from '../hooks/useTyping'

export interface BubbleRef {
  say: (text: string, onSpeaking: (on: boolean) => void) => Promise<void>
  skip: () => void
}

interface ActorProps {
  who: 'doctor' | 'patient'
  label: string
  tagMeta: string
  anchor: WorldAnchors['doctor'] | WorldAnchors['patient']
  bubbleClass: 'dr' | 'pt'
  onSkip?: () => void
  bubbleRefCallback?: (ref: BubbleRef) => void
}

export function SpeechBubble({
  who,
  label,
  tagMeta,
  anchor,
  bubbleClass,
  onSkip,
  bubbleRefCallback,
}: ActorProps) {
  const { vis, hid, thinking, startTyping, skip } = useTyping()

  const say = useCallback(
    (text: string, onSpeaking: (on: boolean) => void) => startTyping(text, onSpeaking),
    [startTyping]
  )

  // Expose the say / skip API via callback ref pattern
  const mountRef = useCallback(
    () => {
      if (bubbleRefCallback) bubbleRefCallback({ say, skip })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )
  // Call on first render
  if (bubbleRefCallback) {
    bubbleRefCallback({ say, skip })
  }

  const visible = anchor.on
  const style: React.CSSProperties = visible
    ? {
        visibility: 'visible',
        transform: `translate3d(${Math.round(anchor.x)}px,${Math.round(anchor.y)}px,0) translate(-50%,-100%)`,
      }
    : { visibility: 'hidden' }

  const hasSpeech = vis.length > 0 || hid.length > 0 || thinking

  return (
    <div
      className="actor"
      style={style}
      ref={(_el) => mountRef()}
    >
      <div
        className={`bubble ${bubbleClass}${hasSpeech ? ' show' : ''}${thinking ? ' thinking' : ''}`}
        role="presentation"
        onClick={() => { if (hasSpeech) { skip(); onSkip?.() } }}
      >
        <span className="who">{label}</span>
        <span className="think" aria-hidden="true">
          <i /><i /><i />
        </span>
        <p className="txt" style={{ margin: 0 }}>
          <span className="vis">{vis}</span>
          <span className="hid" aria-hidden="true">{hid}</span>
        </p>
      </div>
      <div className="tag">
        <b>{who === 'doctor' ? label : label}</b>
        <span>{tagMeta}</span>
      </div>
    </div>
  )
}
