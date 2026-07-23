import { create } from 'zustand'
import { GRASS, HOTBAR_TYPES } from '../engine/blocks'

/**
 * inventoryStore
 * -------------
 * Tracks which block type is currently selected for placement. The hotbar has
 * 5 slots; pressing number keys 1-5 (handled in useHotbarKeys) updates
 * `selectedBlockType`. Selected type is in the range [1..5] and doubles as the
 * block type id (grass=1, dirt=2, stone=3, wood=4, sand=5) — see HOTBAR_TYPES.
 */
interface InventoryState {
  /** Currently selected block type id (1..5), default 1 = grass. */
  selectedBlockType: number
  setSelectedBlockType: (id: number) => void
  /** Convenience selector for the full hotbar type list (used by the HUD). */
  hotbarTypes: number[]
}

export const useInventoryStore = create<InventoryState>((set) => ({
  selectedBlockType: GRASS,
  setSelectedBlockType: (selectedBlockType) => set({ selectedBlockType }),
  hotbarTypes: HOTBAR_TYPES,
}))