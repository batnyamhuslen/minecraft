import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useThree, useFrame } from '@react-three/fiber'
import { useInventoryStore } from '../store/inventoryStore'
import { blockColor } from '../engine/blocks'

/**
 * HeldItem
 * -------
 * First-person "held item" view: a small cube parented to the default R3F
 * camera so it always sits at the same screen position regardless of where the
 * player looks. Mirrors Minecraft's bottom-right held-block view.
 *
 * Mount strategy:
 *   - We grab the canvas camera via `useThree` and PARENT a <group> to it in
 *     an effect (`camera.add(group)`). R3F reconciles our JSX inside that
 *     group; because the group is a child of the camera, every camera
 *     transform is applied to it implicitly — no per-frame math needed to keep
 *     the cube screen-locked.
 *   - Cleanup removes the group from the camera so walking components never
 *     leaks an Object3D into the camera's children.
 *
 * Local-space pose (where the cube sits in CAMERA space):
 *   position [0.55, -0.55, -1.0] → bottom-right, ~1 unit ahead of the eye.
 *   rotation [-0.25, -0.45, 0]  → tilt the top of the cube toward the player
 *     and yaw it to the right, so we see its top + right + front faces — the
 *     natural "holding something in your right hand" angle.
 *
 * Visual layering:
 *   - `material.depthTest = false` + `mesh.renderOrder = 999` makes the held
 *     cube ALWAYS render on top of world geometry (Minecraft's held-item pass
 *     does the same thing). Without this the cube would clip into the block
 *     face you're standing against.
 *   - `castShadow = false` so the small cube doesn't drop a hard, flickery
 *     shadow that tracks the camera.
 *
 * Raycast safety:
 *   - Our voxel picker (raycastVoxel) uses Amanatides–Woo DDA over the voxel
 *     grid via `getWorldBlock` — it physically cannot intersect a mesh, so the
 *     held cube is already excluded from break/place targeting. As defence in
 *     depth we also set `raycast={() => null}` on the mesh so R3F's default
 *     raycaster (used by drei's hover/click helpers, which we don't use here)
 *     could never pick it up either.
 *
 * Swing animation:
 *   - A self-contained `mousedown` listener (only fires while pointer-locked,
 *     buttons 0 or 2) stamps `swingAt`. `useFrame` advances `swingT` from 0→1
 *     over SWING_MS (~180ms) and applies an additive offset derived from
 *     sin(swingT·π): rotation forward + slight downward translation, peaking
 *     at swingT=0.5 and back to rest at swingT=1. Same curve works for both
 *     break (left) and place (right) — we just want ANY click feedback.
 *   - Reading input via the same DOM-down approach PlayerActions uses keeps
 *     the two listeners independent: there's no shared "did the click land"
 *     coupling, and HeldItem doesn't need to know whether a block was actually
 *     broken/placed — it just signals "a click happened".
 */

/** Held-cube edge length (world units). Slightly smaller than a real voxel
 *  so it reads as "an item" rather than "a third arm". */
const CUBE_SIZE = 0.4

/** Resting pose in CAMERA-LOCAL space. Bottom-right-forward of the eye. */
const REST_POS = new THREE.Vector3(0.55, -0.55, -1.0)
const REST_ROT = new THREE.Euler(-0.25, -0.45, 0, 'XYZ')

/** Swing duration in ms. ~180ms lands in the "snappy UI feedback" range. */
const SWING_MS = 180

/** Peak swing offset (radians / world units) applied at swingT = 0.5. */
const SWING_ROT = 0.6 // rad of extra forward pitch
const SWING_DY = -0.08 // small downward jab
const SWING_DZ = 0.05 // tiny forward shove

export default function HeldItem() {
  const camera = useThree((s) => s.camera)
  const selectedType = useInventoryStore((s) => s.selectedBlockType)
  const groupRef = useRef<THREE.Group>(null)
  const meshRef = useRef<THREE.Mesh>(null)

  // Shared unit-cube geometry; material colour is mutated below whenever the
  // selected slot changes. depthTest:false keeps the cube visible through
  // walls; renderOrder on the mesh (below) makes it draw last.
  const geometry = useMemo(() => new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE), [])
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: blockColor(selectedType),
        roughness: 0.85,
        metalness: 0.0,
        depthTest: false,
      }),
    [], // created once; colour updated imperatively in the effect below
  )

  // Parent the group to the camera so the cube inherits camera transforms.
  // R3F's JSX tree attaches our <group> to the scene root by default; we move
  // it to the camera right after mount. Cleanup removes it on unmount so
  // nothing leaks when HeldItem is removed from the tree.
  useEffect(() => {
    const g = groupRef.current
    if (!g) return
    camera.add(g)
    return () => {
      camera.remove(g)
    }
  }, [camera])

  // Dispose GPU resources on unmount (R3F won't dispose geometry/material we
  // produced with `new` inside useMemo).
  useEffect(() => {
    return () => {
      geometry.dispose()
      material.dispose()
    }
  }, [geometry, material])

  // Reactive color: when selectedType changes, swap the material colour.
  // We mutate the existing material rather than recreating it so the GPU
  // doesn't recompile a new program each swap.
  useEffect(() => {
    material.color.copy(blockColor(selectedType))
  }, [material, selectedType])

  // --- Swing trigger --------------------------------------------------------
  // Stamp a timestamp whenever the player left/right clicks while pointer
  // locked. The animation loop below consumes it. We DON'T need to know
  // whether the click broke/placed a block — HeldItem is pure UI feedback.
  const swingAt = useRef(0)
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (!document.pointerLockElement) return
      if (e.button !== 0 && e.button !== 2) return
      swingAt.current = performance.now()
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  // --- Animation loop -------------------------------------------------------
  // Compute swingT each frame; apply an additive pose onto the resting one.
  // Using sin(t·π) gives a 0 → 1 → 0 shape, so the rest pose is exactly
  // reached at swingT = 1 with zero velocity (no snap-back jitter).
  useFrame(() => {
    const g = groupRef.current
    if (!g) return
    const now = performance.now()
    const elapsed = now - swingAt.current
    if (elapsed >= SWING_MS || swingAt.current === 0) {
      // Rest pose.
      g.position.copy(REST_POS)
      g.rotation.copy(REST_ROT)
      return
    }
    const t = elapsed / SWING_MS // 0..1
    const k = Math.sin(t * Math.PI) // 0 → 1 → 0 peak at t=0.5
    g.position.set(REST_POS.x, REST_POS.y + SWING_DY * k, REST_POS.z + SWING_DZ * k)
    g.rotation.set(REST_ROT.x + SWING_ROT * k, REST_ROT.y, REST_ROT.z)
  })

  return (
    <group ref={groupRef}>
      <mesh
        ref={meshRef}
        geometry={geometry}
        material={material}
        // Always draw on top of the world (held-item overlay layer).
        renderOrder={999}
        // No shadow casting/receiving (would track the camera and flicker).
        castShadow={false}
        receiveShadow={false}
        // Defence in depth: exclude from R3F's default raycaster. Our DDA
        // picker couldn't hit a mesh anyway, but explicit is safer.
        raycast={() => null}
      />
    </group>
  )
}