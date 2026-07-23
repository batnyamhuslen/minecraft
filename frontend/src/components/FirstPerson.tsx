import * as THREE from 'three'
import { useThree, useFrame } from '@react-three/fiber'
import { useKeyboard } from '../hooks/useKeyboard'
import { usePlayerStore } from '../store/playerStore'
import { useUIStore } from '../store/uiStore'

/**
 * FirstPerson
 * -----------
 * Moves the active camera on the XZ plane based on WASD, keeping a fixed eye
 * height (no gravity/jump — those come in a later step, per the plan). It is
 * a "frame-driven" component: it renders nothing visual, it only runs logic
 * inside useFrame.
 *
 * useFrame(delta) runs once per rendered frame. `delta` is seconds since the
 * last frame, so multiplying movement by delta makes speed independent of the
 * frame rate (a 60Hz and a 144Hz monitor move the player the same distance
 * per second).
 *
 * Math:
 *  - We read the camera's world direction vector and zero out its Y to get a
 *    flat forward axis on the ground plane.
 *  - The right axis is the forward axis rotated 90° around Y: a cheap trick is
 *    `(z, x) -> (-z, x)` for the right vector in the XZ plane.
 *  - Pressing W adds forward * speed * delta; pressing S subtracts; A/D use
*    the right axis analogously.
 */
// Fixed Y for the no-gravity movement model. With the 4×4 multi-chunk world
// terrain maxing out at ~y=12, y=14 keeps the player just above the surface so
// they fly over hills while still being close enough to break/place blocks.
// Real gravity/collision arrive in a later step, then this becomes the spawn.
const EYE_HEIGHT = 14

export default function FirstPerson() {
  const camera = useThree((s) => s.camera)
  const keys = useKeyboard()
  const speed = usePlayerStore((s) => s.speed)
  const setPosition = usePlayerStore((s) => s.setPosition)
  const inventoryOpen = useUIStore((s) => s.inventoryOpen)

  useFrame((_, delta) => {
    // Pause WASD/movement while the inventory panel is open.
    if (inventoryOpen) return
    const held = keys.current
    // Clamp delta to avoid huge jumps after a tab refocus.
    const dt = Math.min(delta, 0.1)

    // Flat forward direction (ignore Y so movement stays on the ground plane).
    camera.getWorldDirection(tmp.forward)
    tmp.forward.y = 0
    tmp.forward.normalize()

    // Right vector = forward rotated +90° around the Y axis: for a forward
    // vector (fx, 0, fz), right is (-fz, 0, fx). e.g. forward (0,0,-1) → right
    // (1,0,0). (Previously this was (fz, 0, -fx) which mirrored A/D — see the
    // strafe-bug fix: A = left, D = right is the standard convention.)
    tmp.right.set(-tmp.forward.z, 0, tmp.forward.x)

    tmp.move.set(0, 0, 0)

    if (held.has('w')) tmp.move.add(tmp.forward)
    if (held.has('s')) tmp.move.sub(tmp.forward)
    if (held.has('d')) tmp.move.add(tmp.right)
    if (held.has('a')) tmp.move.sub(tmp.right)

    if (tmp.move.lengthSq() > 0) {
      tmp.move.normalize().multiplyScalar(speed * dt)
      camera.position.x += tmp.move.x
      camera.position.z += tmp.move.z
    }

    // Keep a constant eye height (no gravity in this step).
    camera.position.y = EYE_HEIGHT

    setPosition([camera.position.x, camera.position.y, camera.position.z])
  })

  return null
}

// Reusable scratch vectors declared once outside the component so we don't
// allocate THREE.Vector3 every frame (avoids GC churn).
const tmp = {
  forward: new THREE.Vector3(),
  right: new THREE.Vector3(),
  move: new THREE.Vector3(),
}