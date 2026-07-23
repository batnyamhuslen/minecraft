import * as THREE from 'three'
import type { ChunkData } from './chunk'
import { isSolid } from './blocks'
import { getWorldBlock } from './world'

/**
 * raycast.ts
 * ----------
 * Voxel picking via the Amanatides–Woo DDA (Digital Differential Analyzer)
 * algorithm. We march a ray one voxel at a time from the camera, in O(distance)
 * steps, and return the first solid voxel plus the face normal we entered
 * through — the normal tells break/place which adjacent empty cell to fill.
 *
 * Why DDA instead of THREE.Raycaster against the InstancedMesh(es)?
 *  - Raycaster would give us the instanceId of the hit cube + a triangle normal
 *    in *mesh-local* space (each chunk mesh has its own offset). Mapping back
 *    to a world voxel is extra work, and once we move to greedy meshing a
 *    single mesh face will span many voxels so instance-id picking breaks.
 *  - DDA over a regular unit grid is simpler, exact, and decoupled from how
 *    chunks are rendered. It also gives the hit face normal for free as the
 *    axis we just stepped across, and it crosses chunk boundaries without
 *    special-casing: every step we just call getWorldBlock(wx,wy,wz), which
 *    looks up whichever chunk owns that world voxel.
 *
 * Coordinate convention: world voxel (wx,wy,wz) occupies the cube
 * [wx, wx+1) × [wy, wy+1) × [wz, wz+1), centred at (wx+0.5, wy+0.5, wz+0.5).
 * So `voxel = floor(worldPos)` maps world position → world voxel directly.
 * There is no centering offset any more.
 */

export interface Target {
  /** WORLD voxel coords of the hit block. */
  x: number
  y: number
  z: number
  /** Face normal of the hit voxel pointing toward the ray origin (outward).
   *  The adjacent empty cell to place a new block is (x+nx, y+ny, z+nz). */
  nx: number
  ny: number
  nz: number
}

/** Shared per-frame target. BlockHighlight writes each frame; PlayerActions
 *  reads on mousedown. Avoids an extra zustand store + re-renders for data
 *  that changes every frame. */
export const targetRef: { current: Target | null } = { current: null }

/**
 * March from the camera along its look direction, up to `maxDist` world units.
 * Returns the first solid world voxel + entry face normal, or null.
 */
export function raycastVoxel(
  camera: THREE.Camera,
  chunks: Map<string, ChunkData>,
  maxDist = 8,
): Target | null {
  // world voxel space == world space, so origin/dir need no shift.
  const dir = tmpDir
  camera.getWorldDirection(dir)
  const ox = camera.position.x
  const oy = camera.position.y
  const oz = camera.position.z

  // Current world voxel indices.
  let x = Math.floor(ox)
  let y = Math.floor(oy)
  let z = Math.floor(oz)

  // Step direction per axis (+1, -1, or 0 if ray is parallel to that axis).
  const stepX = Math.sign(dir.x)
  const stepY = Math.sign(dir.y)
  const stepZ = Math.sign(dir.z)

  // tDelta: ray distance to cross one full voxel on each axis (∞ if axis
  // parallel). 1/|dir| since voxels are unit-sized and dir is normalized.
  const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity
  const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity
  const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity

  // tMax: ray distance to the next voxel boundary on each axis (∞ if never).
  let tMaxX =
    dir.x === 0 ? Infinity : dir.x > 0 ? (x + 1 - ox) / dir.x : (ox - x) / -dir.x
  let tMaxY =
    dir.y === 0 ? Infinity : dir.y > 0 ? (y + 1 - oy) / dir.y : (oy - y) / -dir.y
  let tMaxZ =
    dir.z === 0 ? Infinity : dir.z > 0 ? (z + 1 - oz) / dir.z : (oz - z) / -dir.z

  // Last-entered face normal (zero until we cross a face on the first step).
  let nx = 0
  let ny = 0
  let nz = 0
  let t = 0

  // Test the starting voxel (in case the camera is somehow inside a solid one;
  // normally the camera is in air and this returns nothing).
  if (isSolid(getWorldBlock(chunks, x, y, z))) {
    return { x, y, z, nx, ny, nz }
  }

  while (t <= maxDist) {
    // Step to the next voxel across whichever boundary is nearest. The step
    // axis becomes the face we entered through → its normal (negated step) is
    // the outward face normal used for placement.
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX
      t = tMaxX
      tMaxX += tDeltaX
      nx = -stepX
      ny = 0
      nz = 0
    } else if (tMaxY < tMaxZ) {
      y += stepY
      t = tMaxY
      tMaxY += tDeltaY
      nx = 0
      ny = -stepY
      nz = 0
    } else {
      z += stepZ
      t = tMaxZ
      tMaxZ += tDeltaZ
      nx = 0
      ny = 0
      nz = -stepZ
    }
    if (t > maxDist) break
    // getWorldBlock transparently crosses chunk boundaries — no special casing.
    if (isSolid(getWorldBlock(chunks, x, y, z))) {
      return { x, y, z, nx, ny, nz }
    }
  }
  return null
}

const tmpDir = new THREE.Vector3()