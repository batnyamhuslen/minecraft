import { AIR } from './blocks'

/**
 * chunk.ts
 * --------
 * A chunk is a fixed-size 3D grid of voxels (16³ = 4096 cells). To keep
 * memory tight and iteration cache-friendly we store it as a single flat
 * Uint8Array (1 byte per voxel) rather than nested arrays. 0 = air.
 *
 * Index layout: i = x + z*SIZE + y*SIZE*SIZE
 *  - x is the fastest axis (stride 1)  → horizontal rows are contiguous
 *  - z is stride 16                    → horizontal slices (xz planes) contiguous
 *  - y is stride 256                   → vertical stacks separated
 * This y-major ordering is convenient for later meshing because a whole
 * horizontal layer lives in one stretch of the array.
 */

export const CHUNK_SIZE = 16
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE // 4096

export interface ChunkData {
  data: Uint8Array
}

export function index(x: number, y: number, z: number): number {
  return x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE
}

export function createChunk(): ChunkData {
  return { data: new Uint8Array(CHUNK_VOLUME) }
}

export function getBlock(chunk: ChunkData, x: number, y: number, z: number): number {
  if (x < 0 || y < 0 || z < 0 || x >= CHUNK_SIZE || y >= CHUNK_SIZE || z >= CHUNK_SIZE) {
    return AIR // out of range = air (lets later meshing treat chunk borders as exposed)
  }
  return chunk.data[index(x, y, z)]
}

export function setBlock(chunk: ChunkData, x: number, y: number, z: number, id: number): void {
  if (x < 0 || y < 0 || z < 0 || x >= CHUNK_SIZE || y >= CHUNK_SIZE || z >= CHUNK_SIZE) return
  chunk.data[index(x, y, z)] = id
}