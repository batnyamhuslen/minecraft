import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useWorldStore } from '../store/worldStore'
import { CHUNK_SIZE, getBlock } from '../engine/chunk'
import { getWorldBlock } from '../engine/world'
import { blockColor, isSolid } from '../engine/blocks'

/**
 * Chunk
 * -----
 * Renders ONE chunk (16³) as an InstancedMesh with per-instance colors. The
 * parent <World> component mounts one of these per chunk coord in the 4×4 grid.
 *
 * Coordinate convention (multi-chunk):
 *   - World voxel (wx,wy,wz) occupies world cube [wx, wx+1)³ centred at
 *     (wx+0.5, wy+0.5, wz+0.5). NO centering offset.
 *   - This chunk owns world voxels [chunkX*16, chunkX*16+15] on X,Z.
 *   - The parent InstancedMesh is positioned at (chunkX*16, 0, chunkZ*16) and
 *     each instance is at local (lx+0.5, ly+0.5, lz+0.5), so voxel (lx,ly,lz)
 *     here ends up at world (chunkX*16 + lx + 0.5, ly+0.5, chunkZ*16 + lz + 0.5).
 *
 * ---- Hidden-block culling (Step 9 perf optimization) ----
 * Each frame, the GPU would otherwise draw every solid voxel's cube faces even
 * though interior blocks (all 6 neighbours solid) are completely enclosed and
 * never visible. Skipping them cuts GPU work and instance buffer size.
 *
 *  - We still ALLOCATE InstancedMesh capacity = total solid blocks in THIS
 *    chunk (cheap: a few thousand Matrix4 slots = ~200KB typed-array memory).
 *  - We SET mesh.count = visible-after-culling on each rebuild, so only the
 *    visible subset is actually drawn. `count <= capacity` is supported by
 *    three.js: only the first `count` instances render.
 *  - Neighbour lookups use getWorldBlock(chunks, wx,wy,wz), which transparently
 *    crosses chunk borders. Out-of-world edges return AIR (so a chunk's outer
 *    surface always counts as exposed). Therefore a block on a chunk edge is
 *    treated as exposed if the *adjacent chunk* has air there — and breaking a
 *    block at a chunk boundary exposes the previously-interior block in the
 *    neighbour chunk. worldStore.setBlock force-clones the 1-relevant neighbour
 *    chunk's ChunkData wrapper on boundary edits so that neighbour's effect
 *    re-runs and recomputes its (now smaller) hidden set; see worldStore.
 *
 *  - `console.log('[cull] …')` per chunk on each rebuild so the before/after
 *    counts can be inspected in devtools (filter the console on "[cull]").
 *
 * Frustum culling: three.js enables frustumCulled on every Object3D by default
 * and R3F does NOT disable it, so offscreen chunks (each is one Object3D with a
 * world-space bounding sphere from its position + geometry) are skipped by the
 * renderer without us writing any custom code. We only optimize at the DATA
 * level here; frustum culling comes for free.
 */
interface ChunkProps {
  chunkX: number
  chunkZ: number
}

const TEMP_MATRIX = new THREE.Matrix4()
const TEMP_COLOR = new THREE.Color()

export default function Chunk({ chunkX, chunkZ }: ChunkProps) {
  const key = `${chunkX},${chunkZ}`
  const chunk = useWorldStore((s) => s.chunks.get(key))
  const meshRef = useRef<THREE.InstancedMesh>(null)

  // Geometry is a unit cube. Material base color is white so the per-instance
  // color passes through unchanged (three multiplies them).
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0.0 }),
    [],
  )

  // Dispose GPU resources when this chunk unmounts (player walked out of render
  // distance → worldStore removed it from the Map → World.tsx drops the
  // <Chunk>). R3F disposes the InstancedMesh object itself but does NOT dispose
  // geometry/material we created via useMemo, so we must do it here to avoid
  // GPU memory leaks as the player roams the unbounded world.
  useEffect(() => {
    return () => {
      geometry.dispose()
      material.dispose()
    }
  }, [geometry, material])

  // Capacity (uncapped solid count in this chunk). The actual visible count is
  // computed in the effect below via neighbour culling; mesh.count clamps drawn
  // instances to that visible count.
  const solidCount = useMemo(() => {
    if (!chunk) return 0
    let n = 0
    for (let i = 0; i < chunk.data.length; i++) if (isSolid(chunk.data[i])) n++
    return n
  }, [chunk])

  // Populate instance matrices + colors whenever THIS chunk's content changes.
  // Re-runs on direct edits (new ChunkData for this chunk) AND when a boundary
  // edit force-clones this chunk (so cross-chunk culling stays correct).
  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh || !chunk) return
    // Read the *live* world map (state at commit time). This is what lets a
    // boundary edit expose the neighbour's interior block — getState() reflects
    // the most recent setBlock, not the chunk snapshot this Chunk subscribed to.
    const chunks = useWorldStore.getState().chunks

    let inst = 0
    let skipped = 0
    const totalSolid = solidCount
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const id = getBlock(chunk, lx, ly, lz)
          if (!isSolid(id)) continue

          // World voxel coords for this local voxel + its 6 world neighbours.
          const wx = chunkX * CHUNK_SIZE + lx
          const wy = ly
          const wz = chunkZ * CHUNK_SIZE + lz
          // Interior test: if every face touches another solid block, this
          // block can never be seen — skip the instance entirely.
          const hidden =
            isSolid(getWorldBlock(chunks, wx + 1, wy, wz)) &&
            isSolid(getWorldBlock(chunks, wx - 1, wy, wz)) &&
            isSolid(getWorldBlock(chunks, wx, wy + 1, wz)) &&
            isSolid(getWorldBlock(chunks, wx, wy - 1, wz)) &&
            isSolid(getWorldBlock(chunks, wx, wy, wz + 1)) &&
            isSolid(getWorldBlock(chunks, wx, wy, wz - 1))
          if (hidden) {
            skipped++
            continue
          }

          TEMP_MATRIX.makeTranslation(lx + 0.5, ly + 0.5, lz + 0.5)
          mesh.setMatrixAt(inst, TEMP_MATRIX)
          TEMP_COLOR.copy(blockColor(id))
          mesh.setColorAt(inst, TEMP_COLOR)
          inst++
        }
      }
    }
    // Tell three.js to re-upload the instanceMatrix + instanceColor buffers.
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    // Only the first `inst` instances are drawn (the ones we just wrote).
    mesh.count = inst

    // Before/after report. One line per chunk per rebuild.
    console.log(
      `[cull] [${chunkX},${chunkZ}] total_solid=${totalSolid} rendered=${inst} skipped=${skipped}`,
    )
  }, [chunk, solidCount, chunkX, chunkZ])

  if (!chunk) return null

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, Math.max(solidCount, 1)]}
      position={[chunkX * CHUNK_SIZE, 0, chunkZ * CHUNK_SIZE]}
      castShadow
      receiveShadow
    />
  )
}