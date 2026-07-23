import { create } from 'zustand'

/**
 * playerStore
 * ----------
 * Minimal first-person camera/player state. In step 1 we only need to mirror
 * the camera position so it can be inspected/tested from outside R3F. Later
 * steps (chunk collision, inventory) will extend this.
 */
interface PlayerState {
  /** Camera position in world units: [x, y, z] */
  position: [number, number, number]
  /** Movement speed in units/second (used for sprint scaling later). */
  speed: number
  /** Update the cached position (called every frame from useFrame). */
  setPosition: (p: [number, number, number]) => void
}

export const usePlayerStore = create<PlayerState>((set) => ({
  // Spawn mirror — EYE position (feet at ~18.4). Gravity in FirstPerson drops
  // the player onto the surface on the first frame; this is just the initial
  // wired value HUD/tests may read before the first useFrame fires.
  position: [0, 20, 24],
  speed: 5,
  setPosition: (position) => set({ position }),
}))