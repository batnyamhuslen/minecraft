import { useEffect } from 'react'
import Scene from './components/Scene'
import HUD from './components/HUD'
import { flushAllSaves } from './store/worldStore'

/**
 * App root.
 * - <Scene/> mounts the WebGL canvas (react-three-fiber).
 * - <HUD/> is an overlayed DOM layer (PointerLockCrosshair in step 1,
 *   full hotbar arrives in step 6).
 *
 * Persistence: chunk edits are debounced 1s before being POSTed to the backend.
 * If the player refreshes / closes the tab inside that window the pending
 * `setTimeout` is cancelled and the edits silently vanish. We register three
 * teardown hooks here to flush every dirty chunk synchronously via sendBeacon
 * (keepalive fetch fallback) so the data survives the page being torn down.
 * `pagehide` covers refresh/close on all modern browsers; `visibilitychange`
 * catches mobile tab switching and OS-level backgrounding; `beforeunload` is a
 * legacy belt-and-braces hook (some user agents still fire it when `pagehide`
 * does not, and vice-versa).
 */
export default function App() {
  useEffect(() => {
    const handler = () => flushAllSaves()
    const visibilityHandler = () => {
      if (document.visibilityState === 'hidden') flushAllSaves()
    }
    window.addEventListener('beforeunload', handler)
    window.addEventListener('pagehide', handler)
    document.addEventListener('visibilitychange', visibilityHandler)
    return () => {
      window.removeEventListener('beforeunload', handler)
      window.removeEventListener('pagehide', handler)
      document.removeEventListener('visibilitychange', visibilityHandler)
    }
  }, [])

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <Scene />
      <HUD />
    </div>
  )
}
