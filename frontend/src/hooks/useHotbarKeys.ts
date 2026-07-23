import { useEffect } from 'react'
import { useInventoryStore } from '../store/inventoryStore'
import { HOTBAR_TYPES } from '../engine/blocks'

/**
 * useHotbarKeys
 * ------------
 * Listens for number keys 1-5 and updates the inventory store's
 * `selectedBlockType` accordingly. Key "1" selects slot 0 (grass), "2" slot 1
 * (dirt), etc.
 *
 * Why a separate hook and not the shared useKeyboard hook?
 *  - useKeyboard keeps a *Set of currently held keys* for movement (it tracks
 *    keydown/up so W is "held" while walking). Hotbar selection is a one-shot
 *    *press* event — we only want to fire once when the key goes down, not
 *    repeatedly while held. Mixing semantics in one hook muddies both.
 *  - The two listeners coexist fine on the same document: useKeyboard doesn't
 *    call preventDefault or stopPropagation, so keydown for "1" reaches both
 *    listeners without conflict (useKeyboard just adds "1" to its held-Set
 *    which movement ignores, and this hook fires the selection once).
 */
export function useHotbarKeys() {
  const setSelectedBlockType = useInventoryStore((s) => s.setSelectedBlockType)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Keys 1-5 → slots 0-4. Ignore if the user is typing in an input.
      if (e.key < '1' || e.key > '5') return
      const slot = Number(e.key) - 1
      const type = HOTBAR_TYPES[slot]
      if (type !== undefined) setSelectedBlockType(type)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setSelectedBlockType])
}