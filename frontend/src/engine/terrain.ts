import { createNoise2D } from 'simplex-noise'
import type { ChunkData } from './chunk'
import { CHUNK_SIZE, createChunk, getBlock } from './chunk'
import { AIR, GRASS, DIRT, STONE } from './blocks'

/**
 * terrain.ts
 * ----------
 * Procedural chunk fill. We use a 2D simplex noise field (smooth random values
 * in [-1,1]) sampled at each (x,z) column to pick a height, then stack layers
 * of block types downwards so the chunk looks like a small grassy hill.
 *
 * Seamlessness across chunks (the key detail for the multi-chunk world):
 *   a noise field is only continuous if neighbouring columns sample neighbouring
 *   noise coordinates. So we sample the noise using WORLD voxel coordinates
 *   (chunkX*16 + localX, chunkZ*16 + localZ) — never chunk-local coords. As
 *   long as every chunk shares the SAME noise2D function (created once from the
 *   seed), the heights at world x=15 (chunk 0, last column) and
 *   world x=16 (chunk 1, first column) are computed from adjacent noise inputs
 *   and therefore differ by a tiny amount → no wall, no seam.
 *
 * Determinism: createNoise2D takes an optional RNG that seeds its permutation
 * table; we pass a seeded mulberry32 so the same seed always yields the same
 * world — essential for testing and any future save/regen.
 */

export const TERRAIN_SEED = 1234

/** Remap noise [-1,1] to an inclusive integer height range [minH, maxH]. */
const MIN_HEIGHT = 2
const MAX_HEIGHT = 12
const NOISE_SCALE = 24 // world units per noise period (smaller = hillier)
const DIRT_DEPTH = 3 // grass sits on this many dirt blocks, then stone

export type Noise2D = (x: number, y: number) => number

/**
 * mulberry32 — a tiny deterministic PRNG that returns floats in [0,1).
 * Enough quality to seed a noise permutation table; not cryptographic.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Create the shared noise function for the whole world (call once). */
export function createWorldNoise(seed: number = TERRAIN_SEED): Noise2D {
  return createNoise2D(mulberry32(seed))
}

/**
 * fillChunkTerrain — fills ONE chunk in place using a shared noise function.
 * Pass the chunk's world coordinates so columns sample world-space noise and
 * terrain stays continuous across chunk boundaries.
 *
 * Returns the same chunk object so callers can chain.
 */
export function fillChunkTerrain(
  chunk: ChunkData,
  chunkX: number,
  chunkZ: number,
  noise2D: Noise2D,
): ChunkData {
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      // WORLD coordinates fed to the noise — this is the seamlessness trick.
      const wx = chunkX * CHUNK_SIZE + lx
      const wz = chunkZ * CHUNK_SIZE + lz
      const n = noise2D(wx / NOISE_SCALE, wz / NOISE_SCALE)
      // Map noise [-1,1] to integer height [MIN..MAX] inclusive.
      const height = Math.round(MIN_HEIGHT + ((n + 1) / 2) * (MAX_HEIGHT - MIN_HEIGHT))

      for (let y = 0; y <= height; y++) {
        let id: number
        if (y === height) id = GRASS // surface
        else if (y >= height - DIRT_DEPTH) id = DIRT // soil below grass
        else id = STONE // bedrock-ish deeper down
        chunk.data[lx + lz * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE] = id
      }
      // y > height stays AIR (zero-initialized)
    }
  }
  return chunk
}

// Re-exports so consumers can pull chunk + block helpers from one place.
export { createChunk, getBlock, AIR, GRASS, DIRT, STONE }