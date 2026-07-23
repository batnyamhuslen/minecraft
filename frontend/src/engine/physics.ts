import type { ChunkData } from './chunk'
import { isSolid } from './blocks'
import { getWorldBlock } from './world'

/**
 * physics.ts
 * ----------
 * Player AABB collision against the voxel grid. The player is treated as an
 * axis-aligned box centred on the camera's X/Z, with its feet at `feetY`:
 *
 *   X : [eyeX - HALF,  eyeX + HALF)
 *   Y : [feetY,        feetY + HEIGHT)
 *   Z : [eyeZ - HALF,  eyeZ + HALF)
 *
 * The camera (eye) sits at `feetY + EYE_HEIGHT`, so FirstPerson keeps the
 * player's feet separate from the eye and integrates gravity on the feet.
 *
 * Coordinate convention reminder: world voxel (wx,wy,wz) occupies the cube
 * [wx,wx+1)³. So `floor(worldY)` is the voxel that contains that height, and
 * the *top face* of a solid block at voxel y is at world height `y + 1` —
 * that's where the player's feet rest.
 *
 * These helpers read the LIVE chunk map from worldStore (`getWorldBlock`
 * returns AIR for unloaded chunks / out-of-range Y), so collision only ever
 * stops the player against currently-loaded solid blocks.
 */

/** Half the player's X/Z footprint (so the AABB is 0.6 wide — slightly thinner
 *  than a 1-block voxel, just like Minecraft's 0.6 hit-box). */
export const PLAYER_HALF_WIDTH = 0.3

/** Full player height. Eye sits 1.6 above the feet, leaving 0.2 of "headroom"
 *  above the eye so the camera doesn't clip straight into a ceiling. */
export const PLAYER_HEIGHT = 1.8

/** Camera/eye offset above the player's feet. This replaces the old fixed
 *  `camera.position.y = 14` model with a height-relative one so gravity can
 *  drop the player onto the surface instead of pinning them at a fixed Y. */
export const EYE_HEIGHT = 1.6

/** Small epsilon so a player exactly aligned with a voxel boundary doesn't
 *  sample the *next* voxel over (half-open ranges). */
const EPS = 1e-6

/**
 * Returns true if the player AABB centred at (eyeX, eyeZ) with feet at
 * `feetY` overlaps ANY solid voxel in the live chunk map. Iterates only the
 * handful of voxels the box actually covers, so it's cheap to call per-frame
 * for per-axis sliding.
 */
export function aabbCollides(
  chunks: Map<string, ChunkData>,
  eyeX: number,
  eyeZ: number,
  feetY: number,
): boolean {
  const minX = Math.floor(eyeX - PLAYER_HALF_WIDTH)
  const maxX = Math.floor(eyeX + PLAYER_HALF_WIDTH - EPS)
  const minZ = Math.floor(eyeZ - PLAYER_HALF_WIDTH)
  const maxZ = Math.floor(eyeZ + PLAYER_HALF_WIDTH - EPS)
  const minY = Math.floor(feetY)
  const maxY = Math.floor(feetY + PLAYER_HEIGHT - EPS)
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        if (isSolid(getWorldBlock(chunks, x, y, z))) return true
      }
    }
  }
  return false
}

/**
 * When the falling player's AABB overlaps solid blocks, snap the feet to rest
 * on the TOP of the highest solid block in the overlap. Scans the AABB's Y
 * range top-down so the first solid voxel found is the highest one the player
 * would otherwise penetrate — its top face (`vy + 1`) is where the feet should
 * sit. Returns null if no solid block overlaps the AABB at this position
 * (i.e. the player isn't actually colliding).
 *
 * Used by the gravity-integration step so the player can fall into a wall of
 * stacked blocks (e.g. a 2-3 block tall cliff face) and settle correctly
 * rather than clipping partway in.
 */
export function highestSolidInAabb(
  chunks: Map<string, ChunkData>,
  eyeX: number,
  eyeZ: number,
  feetY: number,
): number | null {
  const minX = Math.floor(eyeX - PLAYER_HALF_WIDTH)
  const maxX = Math.floor(eyeX + PLAYER_HALF_WIDTH - EPS)
  const minZ = Math.floor(eyeZ - PLAYER_HALF_WIDTH)
  const maxZ = Math.floor(eyeZ + PLAYER_HALF_WIDTH - EPS)
  const minY = Math.floor(feetY)
  const maxY = Math.floor(feetY + PLAYER_HEIGHT - EPS)
  for (let y = maxY; y >= minY; y--) {
    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        if (isSolid(getWorldBlock(chunks, x, y, z))) return y
      }
    }
  }
  return null
}