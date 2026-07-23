import { useRef } from 'react'
import * as THREE from 'three'
import { useThree, useFrame } from '@react-three/fiber'
import { useWorldStore } from '../store/worldStore'
import { useUIStore } from '../store/uiStore'
import { raycastVoxel, targetRef } from '../engine/raycast'

/**
 * BlockHighlight
 * -------------
 * Draws a black wireframe cube around whatever world voxel the player is
 * looking at.
 *
 * Three.js concepts:
 *  - LineSegments: a primitive that draws line edges (vs triangle fills).
 *  - EdgesGeometry(geometry): takes a solid geometry (our 1×1×1 box) and
 *    extracts only the creased edges (the 12 cube edges). Cleaner than
 *    `material.wireframe = true`, which also draws triangle diagonals.
 *  - We inflate the box very slightly (1.001) so the outline sits just above
 *    the block surface and avoids z-fighting (depth-fighting flicker).
 *  - useFrame runs the raycast each frame; the result is also stored in the
 *    shared `targetRef` so PlayerActions can read it at click time.
 *
 * Positioning: world voxel (wx,wy,wz) cube centre is (wx+0.5, wy+0.5, wz+0.5),
 * so the wireframe goes there directly (no offset).
 */
export default function BlockHighlight() {
  const camera = useThree((s) => s.camera)
  const chunks = useWorldStore((s) => s.chunks)
  const inventoryOpen = useUIStore((s) => s.inventoryOpen)
  const meshRef = useRef<THREE.LineSegments>(null)

  // The edges geometry + black line material are static.
  const edgesGeometry = useRef(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.001, 1.001, 1.001)))
  const lineMaterial = useRef(new THREE.LineBasicMaterial({ color: 0x000000, depthTest: true }))

  useFrame(() => {
    // While the inventory is open, the pointer is unlocked (mouse-look off), so
    // the camera direction is meaningless for targeting. Freeze the outline and
    // clear the shared target ref so a stale target can't be acted on.
    if (inventoryOpen) {
      targetRef.current = null
      const mesh = meshRef.current
      if (mesh) mesh.visible = false
      return
    }
    const target = raycastVoxel(camera, chunks, 8)
    targetRef.current = target

    const mesh = meshRef.current
    if (!mesh) return
    if (target) {
      mesh.visible = true
      // World voxel cube centre = (wx+0.5, wy+0.5, wz+0.5).
      mesh.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5)
    } else {
      mesh.visible = false
    }
  })

  return (
    <lineSegments ref={meshRef} geometry={edgesGeometry.current} material={lineMaterial.current} />
  )
}