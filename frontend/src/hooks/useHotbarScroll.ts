import { useEffect } from 'react'
import { useInventoryStore } from '../store/inventoryStore'
import { HOTBAR_TYPES } from '../engine/blocks'

/**
 * useHotbarScroll
 * ---------------
 * Mouse-wheel cycling of the selected hotbar slot. deltaY < 0 (wheel up /
 * towards user) → next slot, deltaY > 0 → previous slot, wrapping around at
 * the ends. Only acts while pointer lock is engaged (i.e. the player is in
 * gameplay) — when the inventory panel is open the pointer is unlocked so
 * scrolling over the page does nothing, matching Minecraft's behaviour.
 *
 *Kept separate from useHotbarKeys for the same reason useKeyboard and
 * useHotbarKeys are separate: a wheel event has different semantics (delta
 * value, no up/down pairing, fires repeatedly while scrolling) than a
 * keydown press, and mixing them muddies both.
 */
export function useHotbarScroll() {
  const setSelectedBlockType = useInventoryStore((s) => s.setSelectedBlockType)

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!document.pointerLockElement) return
      if (HOTBAR_TYPES.length === 0) return
      if (e.deltaY === 0) return

      const current = useInventoryStore.getState().selectedBlockType
      const idx = HOTBAR_TYPES.indexOf(current)
      // If the current selection somehow isn't in the hotbar (defensive —
      // couldn't happen with current inventoryStore) clamp to slot 0.
      const base = idx < 0 ? 0 : idx
      const dir = e.deltaY < 0 ? 1 : -1
      const next = (base + dir) % HOTBAR_TYPES.length
      const wrapped = next < 0 ? next + HOTBAR_TYPES.length : next
      const type = HOTBAR_TYPES[wrapped]
      if (type !== undefined) setSelectedBlockType(type)
    }
    window.addEventListener('wheel', onWheel, { passive: true })
    return () => window.removeEventListener('wheel', onWheel)
  }, [setSelectedBlockType])
}