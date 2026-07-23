import Scene from './components/Scene'
import HUD from './components/HUD'

/**
 * App root.
 * - <Scene/> mounts the WebGL canvas (react-three-fiber).
 * - <HUD/> is an overlayed DOM layer (PointerLockCrosshair in step 1,
 *   full hotbar arrives in step 6).
 */
export default function App() {
  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <Scene />
      <HUD />
    </div>
  )
}
