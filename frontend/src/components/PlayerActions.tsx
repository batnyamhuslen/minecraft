import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { useWorldStore } from '../store/worldStore'
import { useInventoryStore } from '../store/inventoryStore'
import { targetRef } from '../engine/raycast'
import { AIR } from '../engine/blocks'
import { worldToChunk, getWorldBlock } from '../engine/world'

/**
 * PlayerActions
 * ------------
 * Translates mouse clicks into block edits while pointer lock is engaged.
 *
 * Mouse handling: we attach document-level `mousedown` listeners and filter by
 * `e.button` (0 = left → break, 2 = right → place). R3F's pointer events
 * aren't useful against InstancedMeshes for our purposes, and they don't fire
 * reliably under pointer lock, so DOM listeners it is. We also preventDefault
 * the context menu so right-click doesn't pop a browser menu mid-edit.
 *
* Coordinates: the target from raycast is in WORLD voxel coords. We feed
 *  those straight to worldStore.setBlock (which handles chunk lookup and the
 *  chunk-boundary edge case via Math.floor, and no-ops if the chunk isn't
 *  loaded). Guards:
 *  - Only act while pointer is locked.
 *  - Break: setBlock silently no-ops if the owning chunk isn't loaded. Raycast
 *    only returns voxels inside loaded chunks anyway (max reach 8 units, well
 *    within the render distance), so this is just defensive.
 *  - Place: the place cell (target + face normal) must land in a loaded chunk,
 *    must currently be air, and must not be inside the player. The
 *    "inside player" check is a simple distance check from the camera to the
 *    candidate cell's centre (~1.2 units) — no real player AABB/collision yet.
 */
const PLACE_MIN_DIST = 1.2

export default function PlayerActions() {
  const camera = useThree((s) => s.camera)
  const setBlock = useWorldStore((s) => s.setBlock)
  const selectedType = useInventoryStore((s) => s.selectedBlockType)

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      // Only act while pointer-locked.
      if (!document.pointerLockElement) return
      const target = targetRef.current
      if (!target) return

      if (e.button === 0) {
        // Left click → break the targeted world voxel. worldStore.setBlock
        // no-ops if the owning chunk isn't currently loaded.
        setBlock(target.x, target.y, target.z, AIR)
      } else if (e.button === 2) {
        // Right click → place on the adjacent world voxel across the hit face.
        const px = target.x + target.nx
        const py = target.y + target.ny
        const pz = target.z + target.nz

        // Must land in a loaded chunk (setBlock no-ops otherwise, but bail
        // early to skip the air/player checks for untouched terrain).
        if (!useWorldStore.getState().chunks.has(
          `${worldToChunk(px)},${worldToChunk(pz)}`,
        )) return

        // Don't place into an already-solid cell — read the live world state.
        const liveChunks = useWorldStore.getState().chunks
        if (getWorldBlock(liveChunks, px, py, pz) !== AIR) return

        // Don't place a block inside the player. World voxel cube centre:
        // (px+0.5, py+0.5, pz+0.5).
        const cx = px + 0.5
        const cy = py + 0.5
        const cz = pz + 0.5
        const dx = camera.position.x - cx
        const dy = camera.position.y - cy
        const dz = camera.position.z - cz
        if (dx * dx + dy * dy + dz * dz < PLACE_MIN_DIST * PLACE_MIN_DIST) return

        setBlock(px, py, pz, selectedType)
      }
    }

    const onContextMenu = (e: MouseEvent) => {
      if (document.pointerLockElement) e.preventDefault()
    }

    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('contextmenu', onContextMenu)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('contextmenu', onContextMenu)
    }
  }, [camera, setBlock, selectedType])

  return null
}