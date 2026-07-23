import { useEffect, useRef } from 'react'

export type KeyMap = Set<string>

/**
 * useKeyboard
 * ----------
 * Tracks which keys are currently held down in a `Set<string>` ref. We use a
 * ref (not state) because keyboard state changes many times per frame and we
 * don't want React re-renders — the per-frame movement logic in useFrame
 * reads the live Set instead.
 *
 * Keys are stored lowercased via `e.key` (e.g. "w", "a", " ", "shift").
 */
export function useKeyboard(): React.MutableRefObject<KeyMap> {
  const keys = useRef<KeyMap>(new Set())

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keys.current.add(e.key.toLowerCase())
    }
    const up = (e: KeyboardEvent) => {
      keys.current.delete(e.key.toLowerCase())
    }
    // Release everything if the window loses focus (avoids "stuck" keys).
    const blur = () => keys.current.clear()

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])

  return keys
}