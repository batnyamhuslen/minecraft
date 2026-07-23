import { createNoise2D } from 'simplex-noise'
import type { ChunkData } from './chunk'
import { CHUNK_SIZE, createChunk, getBlock, setBlock } from './chunk'
import { AIR, GRASS, DIRT, STONE, WOOD, SAND, LEAVES, FLOWER, TALL_GRASS, CLOUD } from './blocks'

/**
 * terrain.ts
 * ----------
 * Procedural chunk fill + decoration. We use 2D simplex noise fields sampled
 * per (x,z) column to pick a height, then stack layers of block types
 * downwards so the chunk looks like a small grassy hill. After the surface is
 * built we add beaches (sand near low/dry areas via a second "moisture" noise),
 * trees, flowers/tall-grass, and high-altitude clouds. Every step is driven by
 * seeded RNG/noise so the same seed always rebuilds an identical world.
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
 * world — essential for testing and any future save/regen. Tree/decoration
 * placement uses a SEPARATE mulberry32 seeded from a hash of (chunkX, chunkZ,
 * TREE_SEED) so a chunk's tree set is independent of generation order.
 */

export const TERRAIN_SEED = 1234

/** Remap noise [-1,1] to an inclusive integer height range [minH, maxH]. */
const MIN_HEIGHT = 2
const MAX_HEIGHT = 12
const NOISE_SCALE = 24 // world units per noise period (smaller = hillier)
const DIRT_DEPTH = 3 // grass sits on this many dirt blocks, then stone

// --- Beaches (moisture-driven) ---------------------------------------------
// "Sea level" is conceptual (there is no water block in this world yet); we
// just treat low-lying + dry columns as sandy. Heights in [BEACH_MIN..BEACH_MAX]
// AND moisture < BEACH_MOIST_THRESHOLD → top 2 blocks become SAND.
const BEACH_MIN = 3
const BEACH_MAX = 5
const BEACH_MOIST_THRESHOLD = -0.15 // drier-than-this → sand
const MOIST_SCALE = 28 // larger scale → broader wet/dry regions

// --- Trees ------------------------------------------------------------------
const TREE_SEED = 0x7472655 // 'tree' — a separate seed space for tree RNG
const TREE_MAX_SURFACE = 10 // trunk+canopy must fit under the Y=15 ceiling
const TREE_MIN_DIST = 4 // min world-block distance between two trunks in a chunk
const TREE_INNER_MIN = 2 // candidate column lx,lz min (keeps 3x3 canopy in-chunk)
const TREE_INNER_MAX = CHUNK_SIZE - 3 // candidate column lx,lz max (inclusive)
const MAX_TREES_PER_CHUNK = 3

// --- Flowers / tall grass ---------------------------------------------------
const DECOR_SEED = 0x6465636f // 'deco'
const FLOWER_PROB = 0.02
const TALL_GRASS_PROB = 0.06 // placed if rand ∈ [FLOWER_PROB, TALL_GRASS_PROB)

// --- Clouds -----------------------------------------------------------------
const CLOUD_SEED_OFFSET = 2 // cloud noise seed = TERRAIN_SEED + this
const CLOUD_SCALE = 14 // world units per cloud-noise period (smaller = puffier)
const CLOUD_THRESHOLD = 0.7 // cloudNoise > this → cloud cell
const CLOUD_Y = 15 // fixed high layer; non-solid, purely visual

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

/**
 * Hash two signed ints + a seed into a positive 32-bit integer. Used to seed
 * a per-chunk / per-column mulberry32 so the same (x, z, seed) always yields
 * the same random sequence regardless of generation order.
 *
 * We avoid Math.abs (would collide -2^31 / 0) by folding negatives through a
 * multiply-add; constants are arbitrary odd primes (FNV-style mixing).
 */
function hash3(x: number, z: number, seed: number): number {
  let h = (seed | 0) ^ 0x9e3779b9
  h = Math.imul(h ^ (x | 0), 0x85ebca6b)
  h = Math.imul(h ^ (z | 0), 0xc2b2ae35)
  h = (h ^ (h >>> 16)) >>> 0
  return h
}

/** Create the shared terrain-height noise function (call once per world). */
export function createWorldNoise(seed: number = TERRAIN_SEED): Noise2D {
  return createNoise2D(mulberry32(seed))
}

/** Second noise field used for the biome "moisture" layer (beaches). */
export function createWorldMoisture(seed: number = TERRAIN_SEED + 1): Noise2D {
  return createNoise2D(mulberry32(seed))
}

/** Third noise field used for high-altitude cloud patches. */
export function createWorldCloudNoise(seed: number = TERRAIN_SEED + CLOUD_SEED_OFFSET): Noise2D {
  return createNoise2D(mulberry32(seed))
}

/**
 * fillChunkTerrain — fills ONE chunk's surface in place using the shared height
 * + moisture noises. Beaches (sand) are written here so trees/decoration (run
 * afterwards) can see the final surface type. Returns the same chunk object.
 */
export function fillChunkTerrain(
  chunk: ChunkData,
  chunkX: number,
  chunkZ: number,
  noise2D: Noise2D,
  moisture2D: Noise2D = createWorldMoisture(),
): ChunkData {
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      // WORLD coordinates fed to the noise — this is the seamlessness trick.
      const wx = chunkX * CHUNK_SIZE + lx
      const wz = chunkZ * CHUNK_SIZE + lz
      const n = noise2D(wx / NOISE_SCALE, wz / NOISE_SCALE)
      // Map noise [-1,1] to integer height [MIN..MAX] inclusive.
      const height = Math.round(MIN_HEIGHT + ((n + 1) / 2) * (MAX_HEIGHT - MIN_HEIGHT))

      // Beach test: low-lying AND dry → top 2 layers become sand.
      const moist = moisture2D(wx / MOIST_SCALE, wz / MOIST_SCALE)
      const isBeach =
        height >= BEACH_MIN &&
        height <= BEACH_MAX &&
        moist < BEACH_MOIST_THRESHOLD

      for (let y = 0; y <= height; y++) {
        let id: number
        if (y === height) {
          id = isBeach ? SAND : GRASS // surface
        } else if (y >= height - DIRT_DEPTH) {
          // Just below surface: sand under a beach, else dirt.
          id = isBeach && y >= height - 1 ? SAND : DIRT
        } else {
          id = STONE // bedrock-ish deeper down
        }
        chunk.data[lx + lz * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE] = id
      }
      // y > height stays AIR (zero-initialized)
    }
  }
  return chunk
}

/**
 * placeTree — stamp one tree (trunk + canopy) into `chunk` at LOCAL coords
 * (tlx, tlz). Caller has already verified the surface is GRASS and the height
 * fits under the ceiling. Uses the supplied rng for canopy corner omission so
 * the tree's exact shape is deterministic from its (chunkX, chunkZ, column).
 *
 * Index layout reminder: i = x + z*SIZE + y*SIZE*SIZE.
 */
function placeTree(
  chunk: ChunkData,
  tlx: number,
  tlz: number,
  surfaceY: number,
  trunkHeight: number,
  rng: () => number,
): void {
  // Trunk: replace grass surface with WOOD and stack up (trunkHeight blocks).
  const topY = surfaceY + trunkHeight - 1
  for (let y = surfaceY; y <= topY; y++) {
    setBlock(chunk, tlx, y, tlz, WOOD)
  }

  // Canopy: 3x3x2 around the top 2 trunk blocks (y = topY-1..topY), corners
  // randomly omitted. The center column is skipped at those two layers (the
  // trunk passes through it) so leaves never overwrite WOOD.
  for (let ly = topY - 1; ly <= topY; ly++) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dz === 0) continue // trunk column
        // Omit the 4 corners probabilistically for a rounded look.
        if (Math.abs(dx) === 1 && Math.abs(dz) === 1 && rng() < 0.5) continue
        setBlock(chunk, tlx + dx, ly, tlz + dz, LEAVES)
      }
    }
  }

  // Round the very top with a single LEAF cap one block above the trunk.
  setBlock(chunk, tlx, topY + 1, tlz, LEAVES)
}

/**
 * decorateChunk — add trees + flowers + tall-grass into `chunk`. Deterministic
 * per (chunkX, chunkZ): seeds mulberry32 from a hash so the same chunk always
 * decorates identically regardless of when it is (re)generated.
 *
 * Trees: pick MAX_TREES_PER_CHUNK candidates from the inner area (canopy must
 * stay in-chunk), reject non-GRASS / too-tall / too-close-to-another-tree
 * columns. Flowers/tall-grass: per-column hash RNG on top of grass only.
 */
export function decorateChunk(
  chunk: ChunkData,
  chunkX: number,
  chunkZ: number,
  noise2D: Noise2D,
  moisture2D: Noise2D = createWorldMoisture(),
): void {
  const rng = mulberry32(hash3(chunkX, chunkZ, TREE_SEED))

  // Chosen trunk positions (local coords) for min-distance enforcement.
  const placed: Array<{ lx: number; lz: number }> = []
  let attempts = 0
  // Try up to ~3x the budget of candidate picks so we can afford a few rejects.
  while (placed.length < MAX_TREES_PER_CHUNK && attempts < MAX_TREES_PER_CHUNK * 4) {
    attempts++
    const lx = TREE_INNER_MIN + Math.floor(rng() * (TREE_INNER_MAX - TREE_INNER_MIN + 1))
    const lz = TREE_INNER_MIN + Math.floor(rng() * (TREE_INNER_MAX - TREE_INNER_MIN + 1))

    // Min-distance check against already placed trees in this chunk.
    let tooClose = false
    for (const p of placed) {
      const ddx = p.lx - lx
      const ddz = p.lz - lz
      if (ddx * ddx + ddz * ddz < TREE_MIN_DIST * TREE_MIN_DIST) {
        tooClose = true
        break
      }
    }
    if (tooClose) continue

    // World coords for surface-height lookup (must match fillChunkTerrain).
    const wx = chunkX * CHUNK_SIZE + lx
    const wz = chunkZ * CHUNK_SIZE + lz
    const n = noise2D(wx / NOISE_SCALE, wz / NOISE_SCALE)
    const h = Math.round(MIN_HEIGHT + ((n + 1) / 2) * (MAX_HEIGHT - MIN_HEIGHT))
    if (h > TREE_MAX_SURFACE) continue // canopy would clip the Y=15 ceiling
    if (getBlock(chunk, lx, h, lz) !== GRASS) continue // only on grass (not sand)

    placed.push({ lx, lz })
    const trunkHeight = 4 + (rng() < 0.5 ? 1 : 0) // 4 or 5
    placeTree(chunk, lx, lz, h, trunkHeight, rng)
  }

  // Sparse flower / tall-grass on remaining grass columns (never sand, never
  // under a tree trunk). Uses an INDEPENDENT per-column hash so placement is
  // uncorrelated with the chunk-level tree RNG.
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      // Skip the trunk column of any placed tree.
      let onTree = false
      for (const p of placed) {
        if (p.lx === lx && p.lz === lz) {
          onTree = true
          break
        }
      }
      if (onTree) continue

      const wx = chunkX * CHUNK_SIZE + lx
      const wz = chunkZ * CHUNK_SIZE + lz
      const n = noise2D(wx / NOISE_SCALE, wz / NOISE_SCALE)
      const h = Math.round(MIN_HEIGHT + ((n + 1) / 2) * (MAX_HEIGHT - MIN_HEIGHT))
      if (h > MAX_HEIGHT) continue
      if (getBlock(chunk, lx, h, lz) !== GRASS) continue // only on grass

      const r = mulberry32(hash3(wx, wz, DECOR_SEED))()
      if (r < FLOWER_PROB) {
        setBlock(chunk, lx, h + 1, lz, FLOWER)
      } else if (r < TALL_GRASS_PROB) {
        setBlock(chunk, lx, h + 1, lz, TALL_GRASS)
      }
    }
  }

  // Unused moisture arg kept so callers can pass the shared moisture noise
  // without a separate call site; beaches already consumed it in fillChunkTerrain.
  void moisture2D
}

/**
 * generateClouds — paint CLOUD blocks at the fixed high Y=CLOUD_Y layer where
 * the cloud-noise field is high enough. Purely visual, non-solid. Deterministic
 * per column → identical clouds on every regeneration.
 */
export function generateClouds(
  chunk: ChunkData,
  chunkX: number,
  chunkZ: number,
  cloud2D: Noise2D = createWorldCloudNoise(),
): void {
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const wx = chunkX * CHUNK_SIZE + lx
      const wz = chunkZ * CHUNK_SIZE + lz
      const c = cloud2D(wx / CLOUD_SCALE, wz / CLOUD_SCALE)
      if (c > CLOUD_THRESHOLD) {
        setBlock(chunk, lx, CLOUD_Y, lz, CLOUD)
      }
    }
  }
}

/**
 * fillChunkTerrain (the surface pass) — kept in this file. Re-exported below so
 * consumers can pull chunk + block helpers from one place.
 */
export { createChunk, getBlock, setBlock, AIR, GRASS, DIRT, STONE, WOOD, SAND, LEAVES, FLOWER, TALL_GRASS, CLOUD }