import { Canvas } from '@react-three/fiber'
import { PointerLockControls } from '@react-three/drei'
import FirstPerson from './FirstPerson'
import World from './World'
import ChunkManager from './ChunkManager'
import BlockHighlight from './BlockHighlight'
import PlayerActions from './PlayerActions'
import { RENDER_DISTANCE } from '../store/worldStore'

/**
 * Scene
 * ----
 * <Canvas> is react-three-fiber's reconciler root. It creates a single
 * WebGLRenderer, a THREE.Scene and a PerspectiveCamera under the hood and
 * runs a render loop at ~60fps (requestAnimationFrame). Every child we
 * put inside <Canvas> is a *Three.js object* (meshes, lights, cameras...)
 * expressed as JSX, instead of the plain `new THREE.Mesh(...)` API.
 *
 * Concepts used here:
 *  - PerspectiveCamera: simulates a real camera with a frustrum defined by
 *    fov (vertical field of view in degrees) and near/far clip planes. Any
 *    geometry outside [near, far] distance from the camera is culled.
 *  - lights: AmbientLight gives flat base illumination; DirectionalLight
 *    mimics the sun (parallel rays, cheap).
 *  - PointerLockControls (drei): wraps browser Pointer Lock API, so once the
 *    user clicks the canvas the mouse cursor disappears and movement turns
 *    the camera (first-person look). Esc releases.
 */
export default function Scene() {
  // Spawn above the terrain (max height ~12) near the +Z edge so the player
  // looks into the world. The world is unbounded: chunks load/unload around the
  // player as they move, governed by ChunkManager + RENDER_DISTANCE.
  return (
    <Canvas
      camera={{ fov: 75, near: 0.1, far: 1000, position: [0, 14, 24] }}
      gl={{ antialias: true }}
      flat
      shadows
    >
      {/* scene background color */}
      <color attach="background" args={['#7ec0ee']} />

      {/* base lighting */}
      <ambientLight intensity={1.2} />

      {/* Sun: directional light emits parallel rays (cheap) and casts soft
          shadows when <Canvas shadows> is on. */}
      <directionalLight
        position={[40, 60, 20]}
        intensity={2.5}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-50}
        shadow-camera-right={50}
        shadow-camera-top={50}
        shadow-camera-bottom={-50}
        shadow-camera-near={1}
        shadow-camera-far={200}
      />

      {/* Wireframe outline around the world voxel the player is looking at. */}
      <BlockHighlight />

      {/* Tracks player chunk and loads/unloads terrain around them. Placed
          before the movement component so it init-scans the spawn chunk on
          frame 1 (before FirstPerson moves the camera anywhere). */}
      <ChunkManager />

      {/* Voxel world: one InstancedMesh per loaded chunk. */}
      <World />

      {/* Listen for left/right-click to break/place blocks (DOM listeners). */}
      <PlayerActions />

      {/* FPS movement: WASD on the XZ plane, fixed eye height (no gravity). */}
      <FirstPerson />

      {/* Pointer lock first-person look. We attach it as a sibling so it
          takes control of the default camera created by <Canvas>. */}
      <PointerLockControls makeDefault />

      {/* Fog masks the far edge of the loaded area so chunks appearing/disappearing
          at the render distance are hidden behind haze. RENDER_DISTANCE=3 → 48
          blocks; fog ends right at that boundary to soften the world edge. */}
      <fog attach="fog" args={['#7ec0ee', RENDER_DISTANCE * 16 * 0.5, RENDER_DISTANCE * 16]} />
    </Canvas>
  )
}