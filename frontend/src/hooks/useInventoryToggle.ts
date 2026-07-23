import { useEffect } from 'react'
import { useUIStore } from '../store/uiStore'

/**
 * useInventoryToggle
 * -----------------
 * Press "e" to toggle the inventory panel.
 *
 * Pointer-lock coordination:
 *  - Open:  call document.exitPointerLock() so the cursor reappears and the
 *           user can click slots. Setting inventoryOpen=true also makes
 *           FirstPerson stop moving and BlockHighlight stop raycasting.
 *  - Close: call canvas.requestPointerLock() to re-engage first-person look.
 *           Browsers only allow pointer lock from a user gesture — a keydown
 *           counts, so doing it inside this keydown handler is valid.
 *
 * We deliberately do NOT close the inventory when Esc unlocks the pointer
 * (Esc is the game's "release mouse" key, not the inventory key). E is the
 * only way to close it; that keeps the panel predictable.
 *
 * We ignore "e" when Ctrl/Cmd/Alt is held (so browser shortcuts still work)
 * and when the active element is a text input (none exist yet, but defensive).
 */
export function useInventoryToggle() {
  const toggleInventory = useUIStore((s) => s.toggleInventory)
  const setInventoryOpen = useUIStore((s) => s.setInventoryOpen)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'e') return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const el = document.activeElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return

      const open = !useUIStore.getState().inventoryOpen
      if (open) {
        document.exitPointerLock()
        setInventoryOpen(true)
      } else {
        // Re-engage pointer lock. The keydown is the user gesture the browser
        // requires; requestPointerLock returns a promise we can ignore here.
        const canvas = document.querySelector('canvas')
        canvas?.requestPointerLock()
        setInventoryOpen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleInventory, setInventoryOpen])
}