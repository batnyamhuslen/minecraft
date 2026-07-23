import { useEffect, useRef, useState } from 'react'

/**
 * FpsCounter
 * ---------
 * Small monospace FPS readout in the HUD's top-left corner. Uses
 * requestAnimationFrame to count frames, then refreshes the displayed value
 * on a ~250ms cadence — frequent enough to be a stable-looking number, but
 * not so frequent it drives a React re-render every frame (which would be
 * self-defeating on a perf panel).
 *
 * Why rAF and not a fixed setInterval? rAF pauses when the tab is backgrounded
 * (so "minimised tab" reads 0 / freezes naturally) and reports the TRUE frame
 * cadence the renderer is achieving — a setInterval counter would tick during
 * rAF-frozen background tabs and show a phantom FPS.
 *
 * Method:
 *   - On mount, install a rAF loop. Each callback records the inter-frame
 *     time. We keep a frame count + the time of the last *display* update.
 *   - Every DISPLAY_INTERVAL_MS we compute `frames / elapsedSeconds` over
 *     the interval and set that as displayed fps. Reset counters.
 *   - Unmount cancels the rAF handle.
 *
 * Pure timing metric — no zustand state, no scene reads. Mounts cheap.
 */
const DISPLAY_INTERVAL_MS = 250

export default function FpsCounter() {
  const [fps, setFps] = useState(0)
  // Scratch counters kept in refs so they don't trigger re-renders.
  const frameCount = useRef(0)
  const lastSample = useRef(0)

  useEffect(() => {
    let raf = 0
    let mounted = true

    const loop = () => {
      if (!mounted) return
      frameCount.current++
      const now = performance.now()
      if (lastSample.current === 0) {
        // First frame after mount: establish the baseline so the first reading
        // isn't inflated by the mount-to-first-rAF delay.
        lastSample.current = now
      } else {
        const elapsed = now - lastSample.current
        if (elapsed >= DISPLAY_INTERVAL_MS) {
          setFps((frameCount.current * 1000) / elapsed)
          frameCount.current = 0
          lastSample.current = now
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      mounted = false
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        padding: '4px 8px',
        background: 'rgba(0,0,0,0.45)',
        color: '#fff',
        font: '600 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        letterSpacing: 0.4,
        borderRadius: 6,
        pointerEvents: 'none',
        lineHeight: 1,
      }}
    >
      {fps > 0 ? `${fps.toFixed(0)} fps` : '— fps'}
    </div>
  )
}