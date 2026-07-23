import { useEffect, useState } from 'react'
import Hotbar from './Hotbar'
import InventoryPanel from './InventoryPanel'
import FpsCounter from './FpsCounter'
import { useInventoryToggle } from '../hooks/useInventoryToggle'
import { useUIStore } from '../store/uiStore'
import { useWorldStore } from '../store/worldStore'

/**
 * HUD overlay (DOM, not WebGL).
 * Renders the crosshair (aim point) and the bottom-of-screen hotbar
 * (5 block slots, number keys 1-5 to select). Click-to-play hint covers
 * the screen until pointer lock engages.
 */
export default function HUD() {
  // Mount the E-key inventory toggle listener once at HUD level
  // (HUD is a DOM overlay outside the canvas, always mounted).
  useInventoryToggle()
  const inventoryOpen = useUIStore((s) => s.inventoryOpen)

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      {/* Crosshair */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 18,
          height: 18,
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            position: 'absolute',
            width: 14,
            height: 2,
            background: 'rgba(255,255,255,0.85)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            width: 2,
            height: 14,
            background: 'rgba(255,255,255,0.85)',
          }}
        />
      </div>

      {/* Top-left FPS overlay. The ChunkFetchIndicator is positioned just below
          this (top: 44) so the two overlays stack without overlap. */}
      <FpsCounter />

      {/* Click-to-play hint overlay until the user locks the pointer.
            Hidden while the inventory panel is open so the two overlays
            don't stack. */}
      {!inventoryOpen && <ClickToPlayHint />}

      {/* Bottom-centre hotbar: 5 block types, keys 1-5 to select. */}
      <Hotbar />

      {/* Subtle "fetching saved chunks" indicator. Non-blocking: the world is
            already visible (placeholder terrain), so this just signals that some
            chunks may still refresh from the backend. */}
      <ChunkFetchIndicator />

      {/* Toggleable inventory panel (E to toggle). */}
      <InventoryPanel />
    </div>
  )
}

/**
 * Shows a centred hint until pointer lock is engaged. Uses the standard
 * `pointerlockchange` window event so it works regardless of which library
 * triggers the lock.
 */
function ClickToPlayHint() {
  const locked = usePointerLocked()
  if (locked) return null
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        background: 'rgba(0,0,0,0.35)',
        font: '600 16px system-ui',
        letterSpacing: 1,
        pointerEvents: 'none',
      }}
    >
      Click to play · WASD to move · Mouse to look · Esc to release
    </div>
  )
}

function usePointerLocked(): boolean {
  const [locked, setLocked] = useState(false)
  useEffect(() => {
    const handler = () => setLocked(document.pointerLockElement !== null)
    document.addEventListener('pointerlockchange', handler)
    return () => document.removeEventListener('pointerlockchange', handler)
  }, [])
  return locked
}

/**
 * ChunkFetchIndicator
 * ------------------
 * Surfaces in-flight backend chunk fetches. Reads `pendingCount` from
 * worldStore: the store generates placeholder terrain synchronously, so a
 * positive count never means "blank world" — it means some chunks may still
 * refresh from saved server data. Rendered small and out of the way so it
 * doesn't obstruct aiming; vanishes as soon as all fetches settle.
 */
function ChunkFetchIndicator() {
  const pendingCount = useWorldStore((s) => s.pendingCount)
  if (pendingCount <= 0) return null
  return (
    <div
      style={{
        // Stacked below the FPS counter (which is at top:12, ~24px tall) so
        // the two top-left overlays don't overlap when both are visible.
        position: 'absolute',
        top: 44,
        left: 12,
        padding: '6px 10px',
        background: 'rgba(0,0,0,0.45)',
        color: '#fff',
        font: '600 12px system-ui',
        letterSpacing: 0.5,
        borderRadius: 6,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            border: '2px solid rgba(255,255,255,0.35)',
            borderTopColor: '#fff',
            animation: 'chunk-spin 0.8s linear infinite',
            display: 'inline-block',
          }}
        />
        Loading chunks… ({pendingCount})
        <style>{`@keyframes chunk-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
  )
}