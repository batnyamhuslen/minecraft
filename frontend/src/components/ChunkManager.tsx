import { useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { useWorldStore } from '../store/worldStore'
import { useUIStore } from '../store/uiStore'
import { worldToChunk } from '../engine/world'

/**
 * ChunkManager
 * -----------
 * Watches the camera's chunk coordinate each frame and, ONLY when the player
 * crosses into a new chunk, asks worldStore to recompute which chunks should be
 * loaded (add newly-in-range, drop out-of-range). This keeps per-frame work at
 * O(1) — the expensive terrain generation runs only on chunk-border crossings.
 *
 * We read the camera position directly (via useThree) rather than subscribing
 * to playerStore to avoid frame-ordering issues, and call the store action via
 * `getState()` (non-reactive) so this read itself never triggers a re-render.
 *
 * Initial load: on the first frame `lastChunk` is [NaN, NaN], so the comparison
 * fails and updateLoadedChunks fires immediately — populating the world around
 * the spawn point before the player sees anything (bar a 1-frame hitch, which
 * the spec explicitly allows for terrain generation).
 */
export default function ChunkManager() {
  const camera = useThree((s) => s.camera)
  const lastChunk = useRef<[number, number]>([NaN, NaN])

  useFrame(() => {
    // No point loading chunks while the inventory panel is open and the player
    // can't move — minor optimization, also avoids stray loads if the camera
    // was repositioned by something other than movement.
    if (useUIStore.getState().inventoryOpen) return

    const cx = worldToChunk(camera.position.x)
    const cz = worldToChunk(camera.position.z)
    const [lcx, lcz] = lastChunk.current
    if (cx !== lcx || cz !== lcz) {
      lastChunk.current = [cx, cz]
      useWorldStore.getState().updateLoadedChunks(cx, cz)
    }
  })

  return null
}