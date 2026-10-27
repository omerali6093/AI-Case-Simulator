import { useEffect, useRef } from 'react'
import type { WorldAnchors, WorldAPI, WorldHooks } from '../types'

declare global {
  interface Window {
    ClinicWorld?: {
      createWorld: (canvas: HTMLCanvasElement, hooks: WorldHooks) => WorldAPI | null
      createNullWorld: (hooks: WorldHooks) => WorldAPI
    }
  }
}

/**
 * Initialises the Three.js world once the canvas is mounted.
 * Returns a stable ref whose `.current` holds the world API (or null until ready).
 */
export function useWorld(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  hooks: WorldHooks
): React.RefObject<WorldAPI | null> {
  const worldRef = useRef<WorldAPI | null>(null)
  // Keep a stable reference to hooks to avoid re-running the effect when callbacks change identity
  const hooksRef = useRef(hooks)
  hooksRef.current = hooks

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !window.ClinicWorld) return

    const stableHooks: WorldHooks = {
      onAnchors: (a: WorldAnchors) => hooksRef.current.onAnchors(a),
      doctorVisible: () => hooksRef.current.doctorVisible(),
      onDowngrade: (msg: string) => hooksRef.current.onDowngrade(msg),
    }

    let world: WorldAPI
    try {
      world = window.ClinicWorld.createWorld(canvas, stableHooks) ?? window.ClinicWorld.createNullWorld(stableHooks)
    } catch {
      world = window.ClinicWorld.createNullWorld(stableHooks)
    }

    if (!world.is3d) {
      canvas.hidden = true
      document.body.classList.add('no3d')
    }

    worldRef.current = world

    return () => {
      // Three.js world doesn't expose a dispose, but we can null the ref
      worldRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // run once on mount

  return worldRef
}
