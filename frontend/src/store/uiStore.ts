import { create } from 'zustand'

/**
 * uiStore
 * ------
 * Lightweight UI/gameplay flags that components outside the canvas (and a few
 * inside it) need to coordinate on. Currently just the inventory-panel toggle.
 *
 * `inventoryOpen` doubles as the gameplay-pause flag:
 *  - FirstPerson skips movement when true (WASD frozen).
 *  - BlockHighlight hides + stops raycasting when true.
 *  - PlayerActions is gated on pointer lock, and opening the panel exits
 *    pointer lock, so break/place are automatically suppressed.
 */
interface UIState {
  inventoryOpen: boolean
  toggleInventory: () => void
  setInventoryOpen: (v: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  inventoryOpen: false,
  toggleInventory: () => set((s) => ({ inventoryOpen: !s.inventoryOpen })),
  setInventoryOpen: (inventoryOpen) => set({ inventoryOpen }),
}))