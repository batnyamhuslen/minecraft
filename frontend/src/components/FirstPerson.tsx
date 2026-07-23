import * as THREE from 'three'
import { useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { useKeyboard } from '../hooks/useKeyboard'
import { usePlayerStore } from '../store/playerStore'
import { useUIStore } from '../store/uiStore'
import { useWorldStore } from '../store/worldStore'
import {
  aabbCollides,
  highestSolidInAabb,
  EYE_HEIGHT,
} from '../engine/physics'

/**
 * FirstPerson
 * -----------
 * Frame-driven player controller: WASD strafing + PointerLock look (look is
 * handled by <PointerLockControls>, not here; we only own translation).
 *
 * Vertical physics (gravity + jump + ground/ceiling collision) lives here.
 * Horizontal physics (WASD with per-axis AABB sliding) also lives here.
 *
 * State model:
 *  - `feetY` (ref, not React state): the world Y of the player's feet. The
 *    camera (eye) is positioned at `feetY + EYE_HEIGHT` each frame so gravity
 *    can move the feet freely while the eye follows 1.6 above.
 *  - `vy` (ref): signed vertical velocity in units/s. Gravity subtracts from
 *    it every frame; jump adds to it once on keypress; landing zeroes it.
 *
 * Integration order per frame:
 *   1. Grounded probe  (a small downward AABB check) → can we jump?
 *   2. Jump input       (Space) — only if grounded, applies +JUMP_VELOCITY
 *   3. Gravity          — vy += GRAVITY * dt
 *   4. Vertical move    — integrate feetY; if the new AABB collides, either
 *                         land (snap onto the highest solid block's top,
 *                         vy = 0) or hit the ceiling (vy = 0, no move up)
 *   5. Horizontal move  — WASD-based XZ delta, applied per-axis so the player
 *                         slides along walls instead of sticking
 *
 * Per-axis horizontal collision (the "sliding" trick): we attempt X and Z
 * independently — if moving in X alone would collide, we keep the old X (still
 * allow Z); same for Z. This is the standard cheap way to make the player
 * slide along walls without writing a real swept-AABB resolver.
 *
 * All collision queries get the LIVE chunk map from worldStore via
 * `getState()` (non-reactive) — `getWorldBlock` transparently crosses chunk
 * boundaries and returns AIR for unloaded chunks / out-of-range Y, so a
 * missing chunk simply means "no wall there" (the player walks into the void
 * edge of the loaded area rather than hitting an invisible barrier).
 */

/** Gravity acceleration in units/s². Tuned to feel Minecraft-ish at our 1:1
 *  world scale (≈ -20 ≈ half of Earth's 9.8m/s² scaled up slightly so jumps
 *  aren't floaty). Negative = downward. */
const GRAVITY = -20

/** Jump impulse applied to `vy` on Space press (units/s). With GRAVITY=-20 and
 *  JUMP_VELOCITY=8, peak jump height is v² / (2·|g|) = 64 / 40 ≈ 1.6 blocks —
 *  enough to clear a 1-block step, slightly short of a 2-block jump. */
const JUMP_VELOCITY = 8

/** How far below the player's feet the grounded probe extends. Just a small
 *  skin so a player resting exactly on a block top (feetY == integer) is
 *  detected as grounded without having to fall a full frame first — this is
 *  what makes jumps feel responsive instead of requiring a "settle" frame. */
const GROUND_PROBE = 0.05

/** Hard-clamp per-frame dt so a tab refocus (delta jumps to many seconds)
 *  doesn't teleport the player through the floor before the AABB check runs. */
const MAX_DT = 0.1

export default function FirstPerson() {
  const camera = useThree((s) => s.camera)
  const keys = useKeyboard()
  const speed = usePlayerStore((s) => s.speed)
  const setPosition = usePlayerStore((s) => s.setPosition)
  const inventoryOpen = useUIStore((s) => s.inventoryOpen)

  // Vertical state, kept in refs (not Zustand) because it changes every frame
  // and we don't want React re-renders.
  const vy = useRef(0)
  const feetY = useRef(0)
  const inited = useRef(false)

  useFrame((_, delta) => {
    // Pause movement while the inventory panel is open (matches the previous
    // ground-locked behaviour so opening E doesn't drift the camera).
    if (inventoryOpen) return
    const held = keys.current
    const dt = Math.min(delta, MAX_DT)
    const chunks = useWorldStore.getState().chunks

    // First-frame init: derive feet position from the Canvas spawn camera
    // position (set in <Canvas camera={{ position: [...] }}>). After this we
    // own feetY and the camera's Y is derived from it.
    if (!inited.current) {
      inited.current = true
      feetY.current = camera.position.y - EYE_HEIGHT
    }

    // --- 1. Grounded probe ----------------------------------------------
    // A small AABB check just below the feet. If there's a solid block there
    // the player is standing on it (resting exactly on a block top still
    // overlaps with a few hundredths of skin, which is what we want).
    const grounded = aabbCollides(
      chunks,
      camera.position.x,
      camera.position.z,
      feetY.current - GROUND_PROBE,
    )

    // --- 2. Jump ---------------------------------------------------------
    // useKeyboard stores `e.key.toLowerCase()`, and Space's e.key is " "
    // (a single space character). Only allow the impulse when grounded so a
    // held Space in mid-air doesn't bounce the player on landing.
    if (held.has(' ') && grounded) {
      vy.current = JUMP_VELOCITY
    }

    // --- 3. Gravity ------------------------------------------------------
    vy.current += GRAVITY * dt

    // --- 4. Vertical integration with ground / ceiling resolution --------
    const nextFeetY = feetY.current + vy.current * dt
    if (aabbCollides(chunks, camera.position.x, camera.position.z, nextFeetY)) {
      if (vy.current <= 0) {
        // Falling and the next feet position overlaps solid blocks: snap to
        // rest on the TOP of the highest solid block in the AABB. This handles
        // landing on a flat floor (one solid y in the box) AND landing on the
        // edge of a tall wall (multiple solid y's — we take the highest).
        const topSolidY = highestSolidInAabb(
          chunks,
          camera.position.x,
          camera.position.z,
          nextFeetY,
        )
        if (topSolidY !== null) {
          feetY.current = topSolidY + 1 // top face of that block
        }
        vy.current = 0
      } else {
        // Moving up and clipped the ceiling: kill upward velocity, leave the
        // feet where they were so the player doesn't clip through.
        vy.current = 0
      }
    } else {
      feetY.current = nextFeetY
    }
    camera.position.y = feetY.current + EYE_HEIGHT

    // --- 5. Horizontal movement (WASD) with per-axis AABB sliding --------
    camera.getWorldDirection(tmp.forward)
    tmp.forward.y = 0
    tmp.forward.normalize()

    // Right vector = forward rotated +90° around Y. For a forward (fx,0,fz),
    // right is (-fz, 0, fx). e.g. forward (0,0,-1) → right (1,0,0). This makes
    // A = left, D = right (the standard convention).
    tmp.right.set(-tmp.forward.z, 0, tmp.forward.x)

    tmp.move.set(0, 0, 0)
    if (held.has('w')) tmp.move.add(tmp.forward)
    if (held.has('s')) tmp.move.sub(tmp.forward)
    if (held.has('d')) tmp.move.add(tmp.right)
    if (held.has('a')) tmp.move.sub(tmp.right)

    if (tmp.move.lengthSq() > 0) {
      tmp.move.normalize().multiplyScalar(speed * dt)

      // Try X first: if the new X would put the AABB inside a wall, refuse the
      // X step (player keeps the old X) — they can still slide in Z.
      const tryX = camera.position.x + tmp.move.x
      if (!aabbCollides(chunks, tryX, camera.position.z, feetY.current)) {
        camera.position.x = tryX
      }

      // Then try Z using the (possibly-updated) X — gives corner-sliding that
      // hugs the wall instead of stopping dead.
      const tryZ = camera.position.z + tmp.move.z
      if (!aabbCollides(chunks, camera.position.x, tryZ, feetY.current)) {
        camera.position.z = tryZ
      }
    }

    setPosition([camera.position.x, camera.position.y, camera.position.z])
  })

  return null
}

// Reusable scratch vectors declared once outside the component so we don't
// allocate a THREE.Vector3 every frame (avoids GC churn).
const tmp = {
  forward: new THREE.Vector3(),
  right: new THREE.Vector3(),
  move: new THREE.Vector3(),
}