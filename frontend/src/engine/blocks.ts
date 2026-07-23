import * as THREE from 'three'

/**
 * blocks.ts
 * --------
 * Block-type registry. One byte per voxel in the chunk array; 0 is reserved
 * for "air" (no block). Each solid type has a display color used by the
 * InstancedMesh material. Textures arrive later; for now MeshStandardMaterial
 * with a flat color is enough to see the geometry.
 *
 * Adding a new block type = add an entry here. The hotbar (step 6) will read
 * this palette to render slot icons.
 */
export const AIR = 0
export const GRASS = 1
export const DIRT = 2
export const STONE = 3
export const WOOD = 4
export const SAND = 5

export const BLOCK_SIZE = 1 // world units per voxel edge

export interface BlockType {
  id: number
  name: string
  color: number
}

export const BLOCKS: Record<number, BlockType> = {
  [GRASS]: { id: GRASS, name: 'grass', color: 0x5fb24a },
  [DIRT]: { id: DIRT, name: 'dirt', color: 0x7a5a3a },
  [STONE]: { id: STONE, name: 'stone', color: 0x888888 },
  [WOOD]: { id: WOOD, name: 'wood', color: 0x6b4f2a },
  [SAND]: { id: SAND, name: 'sand', color: 0xd9c178 },
}

/**
 * Hotbar slot order: key "1" → hotbar[0], key "2" → hotbar[1], and so on.
 * Each entry is a block type id. Keys map 1:1 to ids here (grass=1…) so this
 * looks redundant, but keeping an explicit list decouples slot order from id
 * values — we could swap slots around later without touching block ids.
 */
export const HOTBAR_TYPES: number[] = [GRASS, DIRT, STONE, WOOD, SAND]

export function blockColor(id: number): THREE.Color {
  const def = BLOCKS[id]
  return new THREE.Color(def ? def.color : 0xff00ff)
}

export function isSolid(id: number): boolean {
  return id !== AIR
}