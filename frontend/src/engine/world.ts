import type { ChunkData } from './chunk'
import { CHUNK_SIZE, getBlock as getChunkBlock, createChunk } from './chunk'
import { AIR } from './blocks'
import type { Noise2D } from './terrain'
import {
  createWorldNoise,
  createWorldMoisture,
  createWorldCloudNoise,
  fillChunkTerrain,
  decorateChunk,
  generateClouds,
  TERRAIN_SEED,
} from './terrain'

/**
 * world.ts
 * --------
 * Multi-chunk world helpers for an *unbounded* world. Chunks live in a Map
 * keyed by `"chunkX,chunkZ"`; only the subset within the player's render
 * distance is loaded at any time (dynamic load/unload lives in worldStore /
 * ChunkManager). There are no fixed world bounds any more.
 *
 * Coordinate conventions:
 *   - World voxel (wx,wy,wz) → world cube [wx, wx+1) × [wy, wy+1) × [wz, wz+1),
 *     centred at (wx+0.5, wy+0.5, wz+0.5). NO centering offset.
 *   - Chunk (chunkX,chunkZ) owns world voxels [chunkX*16, chunkX*16+15] on X,
 *     same for Z. Y stays single-layer (0..15) for now.
 *   - chunkX/chunkZ are SIGNED ints; Math.floor(w/16) maps a world voxel to its
 *     owner chunk including negatives (worldToChunk(-1) = -1, local 15).
 *
 * Determinism: `createWorldNoise(seed)` builds one shared noise function. Every
 * chunk generated from the same seed produces identical terrain, so walking
 * away and back regenerates the same chunk. (Block edits are ephemeral until
 * Step 11 adds persistence.)
 */

/** String key for a chunk coordinate, used as Map key. */
export function chunkKey(chunkX: number, chunkZ: number): string {
  return `${chunkX},${chunkZ}`
}

/** Inverse of chunkKey → [chunkX, chunkZ]. */
export function parseChunkKey(key: string): [number, number] {
  const [cx, cz] = key.split(',').map(Number)
  return [cx, cz]
}

/** Which chunk owns this world voxel coordinate? */
export function worldToChunk(worldX: number): number {
  return Math.floor(worldX / CHUNK_SIZE)
}

/** Local 0..15 index of a world voxel inside its owning chunk. */
export function worldToLocal(worldX: number, chunkX: number): number {
  return worldX - chunkX * CHUNK_SIZE
}

/**
 * Generate ONE chunk at a given chunk coordinate, fully decorated, using the
 * shared noises. Same (chunkX, chunkZ, noises) → identical output every time,
 * so chunks regenerate identically when the player returns.
 *
 * Order matters: surface+beaches first (fillChunkTerrain), then trees/flowers
 * (decorateChunk — needs the surface type to skip sand), then clouds at the
 * high Y layer. Because each pass only writes to previously-empty cells (and
 * clouds live at Y=15, well above trees whose canopy caps at most Y=15 too —
 * rare collisions on a single column are tolerated: cloud simply overwrites
 * the leaf cap), there are no ordering hazards. Every chunk goes through this
 * pipeline — initial spawn AND dynamic load — so decoration is consistent.
 */
export function generateChunkAt(
  chunkX: number,
  chunkZ: number,
  noise2D: ReturnType<typeof createWorldNoise>,
): ChunkData {
  const chunk = createChunk()
  fillChunkTerrain(chunk, chunkX, chunkZ, noise2D, worldMoisture)
  decorateChunk(chunk, chunkX, chunkZ, noise2D, worldMoisture)
  generateClouds(chunk, chunkX, chunkZ, worldCloud)
  return chunk
}

/** Look up a block by WORLD voxel coords. Returns AIR for any voxel whose chunk
 *  isn't currently loaded (missing Map entry) — so raycast/culling naturally
 *  treat the world edge as air. */
export function getWorldBlock(
  chunks: Map<string, ChunkData>,
  wx: number,
  wy: number,
  wz: number,
): number {
  if (wy < 0 || wy >= CHUNK_SIZE) return AIR
  const chunkX = worldToChunk(wx)
  const chunkZ = worldToChunk(wz)
  const chunk = chunks.get(chunkKey(chunkX, chunkZ))
  if (!chunk) return AIR
  const lx = worldToLocal(wx, chunkX)
  const lz = worldToLocal(wz, chunkZ)
  return getChunkBlock(chunk, lx, wy, lz)
}

export { createChunk, CHUNK_SIZE, AIR, TERRAIN_SEED, createWorldNoise, createWorldMoisture, createWorldCloudNoise }

/**
 * Shared secondary noise fields for the whole world. Built once at module
 * load (like the worldStore's worldNoise) and used by generateChunkAt so that
 * every chunk — initial and dynamically loaded — decorates consistently.
 * Their seeds are derived from TERRAIN_SEED so the world is still a function
 * of the single canonical seed.
 */
const worldMoisture: Noise2D = createWorldMoisture()
const worldCloud: Noise2D = createWorldCloudNoise()