import { create } from 'zustand'
import type { ChunkData } from '../engine/chunk'
import {
  setBlock as setChunkBlock,
  createChunk,
  CHUNK_SIZE,
  CHUNK_VOLUME,
} from '../engine/chunk'
import type { Noise2D } from '../engine/terrain'
import {
  generateChunkAt,
  chunkKey,
  parseChunkKey,
  worldToChunk,
  worldToLocal,
  TERRAIN_SEED,
  createWorldNoise,
} from '../engine/world'
import { fetchChunk, saveChunk, saveChunkSync } from '../api/chunks'

/**
 * worldStore
 * ---------
 * Dynamic multi-chunk world state. Only the chunks within the player's render
 * distance are kept in the `chunks` Map; walking away unloads them, walking
 * back regenerates them deterministically from the shared noise seed, then
 * refreshes from the backend if a saved copy exists.
 *
 * Render distance R (in chunks) defines a (2R+1)² square window centered on the
 * player's current chunk. With R=3 that's 7×7 = 49 chunks loaded at a time.
 *
 * Persistence (Step 11):
 *   - LOAD: when a chunk comes into range we generate it instantly from the
 *     noise seed so the world never goes blank, then fire a background
 *     `fetchChunk`. If the backend returns saved bytes AND the chunk hasn't
 *     been locally edited since load, we swap the placeholder out for the
 *     saved copy — so player edits persist across revisits once the backend is
 *     up. A 404 / network error means "no saved copy" and we just keep the
 *     generated terrain. Backend-down therefore degrades silently to Step 10
 *     behaviour (pure procedural terrain).
 *   - SAVE: every block edit marks the owning chunk dirty and (re)starts a
 *     1s debounce timer for that chunk. When the timer fires we POST the
 *     chunk's current bytes. We also flush the save immediately when a dirty
 *     chunk unloads, so walking away within the debounce window can't drop
 *     edits. `saveChunk` failures only `console.warn` — never throw to gameplay.
 *
 * Edits are immutable at two levels:
 *   1. The edited chunk's Uint8Array is copied.
 *   2. A new Map replaces the old one.
 * Per-chunk re-renders stay efficient: each <Chunk> subscribes to its own key.
 *
 * NOTE on `pendingCount`: reflects in-flight background fetches, used by the
 * HUD loading indicator. It is NOT "world isn't visible yet" — the world is
 * always visible immediately thanks to the placeholder; this only signals that
 * some chunks may still refresh from the backend.
 */

/** Render distance in chunks (3 → 7×7 window around the player). */
export const RENDER_DISTANCE = 3

/** World identifier sent to the backend. Hardcoded for now; swap for a
 *  per-save / per-session value once multi-world support is needed. */
export const WORLD_ID = 'default'

/** How long after the last edit to a chunk before we POST it. Tuned so rapid
 *  click-editing (break / place spam) coalesces into one request. */
const SAVE_DEBOUNCE_MS = 1000

/** Single shared noise function for the whole world (created once, never
 *  changes). Stored outside zustand so it never triggers renders. */
const worldNoise: Noise2D = createWorldNoise(TERRAIN_SEED)

/**
 * Module-level (non-reactive) bookkeeping. Kept out of state because it must
 * not trigger React renders, and because timers / sets aren't serialisable.
 */
const wantedKeys: Set<string> = new Set() // chunks the player currently wants loaded
const localEdited: Set<string> = new Set() // chunks edited locally since load — never overwrite from backend
const dirtyTimers: Map<string, ReturnType<typeof setTimeout>> = new Map() // save debounce handles

interface WorldState {
  /** Currently loaded chunks, keyed by "chunkX,chunkZ". */
  chunks: Map<string, ChunkData>
  /** Number of background backend fetches still in flight (for the HUD
   *  loading indicator). The world is already visible; this just signals
   *  that some chunks may still refresh from saved data. */
  pendingCount: number
  /** Recompute which chunks should be loaded given the player's chunk coords.
   *  Adds newly-in-range chunks (generated from seed immediately), removes
   *  out-of-range ones, and kicks off background backend fetches for the new
   *  ones. Keeps already-loaded in-range chunks untouched (no regeneration). */
  updateLoadedChunks: (playerChunkX: number, playerChunkZ: number) => void
  /** Edit the voxel at WORLD coords. No-ops if the owning chunk isn't loaded. */
  setBlock: (wx: number, wy: number, wz: number, id: number) => void
}

/** Build a ChunkData from backend bytes, defensively truncating / zero-padding
 *  to CHUNK_VOLUME so a malformed payload can't index out of range. The
 *  dominant case (backend served exactly 4096 bytes) is a single fast copy. */
function chunkFromBytes(bytes: Uint8Array): ChunkData {
  const data = new Uint8Array(CHUNK_VOLUME)
  const n = Math.min(bytes.length, CHUNK_VOLUME)
  if (n > 0) data.set(bytes.subarray(0, n))
  return { data }
}

/**
 * (Re)start the save debounce for a chunk that has just been edited. Each call
 * clears any previous timer for that key, so a flurry of edits collapses into
 * a single POST one second after the last edit. Failures are logged but never
 * thrown — a down backend must not interrupt gameplay.
 */
function scheduleSave(chunkX: number, chunkZ: number): void {
  const key = chunkKey(chunkX, chunkZ)
  const existing = dirtyTimers.get(key)
  if (existing !== undefined) clearTimeout(existing)

  const timer = setTimeout(() => {
    dirtyTimers.delete(key)
    const chunk = useWorldStore.getState().chunks.get(key)
    if (!chunk) return // unloaded while the timer was pending
    saveChunk(WORLD_ID, chunkX, chunkZ, chunk.data).catch((err) => {
      console.warn('saveChunk failed', { chunkX, chunkZ, err })
    })
  }, SAVE_DEBOUNCE_MS)
  dirtyTimers.set(key, timer)
}

/**
 * Immediately POST a chunk's bytes (used on unload so edits aren't lost when
 * the player walks out of range before the debounce fires). Cancels any
 * pending debounce timer for the key. Safe to call on non-dirty chunks (no-op).
 */
function flushSave(key: string): void {
  const timer = dirtyTimers.get(key)
  if (timer === undefined) return
  clearTimeout(timer)
  dirtyTimers.delete(key)

  const [chunkX, chunkZ] = parseChunkKey(key)
  const chunk = useWorldStore.getState().chunks.get(key)
  if (!chunk) return
  saveChunk(WORLD_ID, chunkX, chunkZ, chunk.data).catch((err) => {
    console.warn('flushSave failed', { chunkX, chunkZ, err })
  })
}

/**
 * Background fetch for a freshly-generated chunk. On success swaps the
 * placeholder for the saved bytes — but ONLY if the chunk is still wanted
 * (player may have walked away) and hasn't been locally edited since load
 * (don't clobber player edits). A null/error result leaves the generated
 * placeholder in place. Always decrements `pendingCount` regardless of
 * outcome so the indicator can't get stuck.
 */
/**
 * Flush every chunk that has a pending debounce save immediately, using the
 * sync `sendBeacon`/keepalive path. Designed to run on `beforeunload` /
 * `pagehide` / `visibilitychange(hidden)` so that edits made within the 1s
 * debounce window are not dropped when the tab/browser/refresh tears the page
 * down (which would otherwise cancel the pending `setTimeout` before it fires).
 *
 * This mirrors the per-chunk flush we already do when a chunk leaves the render
 * window — it just runs for ALL dirty chunks at once, on page teardown. Safe
 * to call repeatedly: it clears each timer then removes it from `dirtyTimers`.
 */
export function flushAllSaves(): void {
  if (dirtyTimers.size === 0) return
  // Snapshot the keys first — flushSave mutates `dirtyTimers` during iteration.
  for (const key of Array.from(dirtyTimers.keys())) {
    const timer = dirtyTimers.get(key)
    if (timer !== undefined) clearTimeout(timer)
    dirtyTimers.delete(key)

    const [chunkX, chunkZ] = parseChunkKey(key)
    const chunk = useWorldStore.getState().chunks.get(key)
    if (!chunk) continue // already unloaded
    saveChunkSync(WORLD_ID, chunkX, chunkZ, chunk.data)
  }
}

async function loadChunk(chunkX: number, chunkZ: number): Promise<void> {
  const key = chunkKey(chunkX, chunkZ)
  let bytes: Uint8Array | null
  try {
    bytes = await fetchChunk(WORLD_ID, chunkX, chunkZ)
  } catch (err) {
    // Backend unreachable / errored — keep the generated placeholder.
    console.warn('fetchChunk failed; keeping generated terrain', { chunkX, chunkZ, err })
    bytes = null
  }

  useWorldStore.setState((s) => ({
    pendingCount: Math.max(0, s.pendingCount - 1),
    chunks:
      bytes && wantedKeys.has(key) && !localEdited.has(key)
        ? (() => {
            const next = new Map(s.chunks)
            next.set(key, chunkFromBytes(bytes as Uint8Array))
            return next
          })()
        : s.chunks,
  }))
}

export const useWorldStore = create<WorldState>((set) => ({
  chunks: new Map(),
  pendingCount: 0,

  updateLoadedChunks: (playerChunkX, playerChunkZ) =>
    set((state) => {
      const R = RENDER_DISTANCE
      const keepKeys = new Set<string>()
      const newChunks: Array<[number, number]> = []

      // Refresh the wanted set with the current render window.
      wantedKeys.clear()
      for (let dz = -R; dz <= R; dz++) {
        for (let dx = -R; dx <= R; dx++) {
          const cx = playerChunkX + dx
          const cz = playerChunkZ + dz
          const key = chunkKey(cx, cz)
          keepKeys.add(key)
          wantedKeys.add(key)
        }
      }

      // Generate placeholders for any wanted chunk that isn't loaded yet.
      // Generating here (synchronous) means the world is visible immediately,
      // with no blank window while the backend round-trip is in flight.
      const nextChunks = new Map(state.chunks)
      for (const key of keepKeys) {
        if (!nextChunks.has(key)) {
          const [cx, cz] = parseChunkKey(key)
          nextChunks.set(key, generateChunkAt(cx, cz, worldNoise))
          newChunks.push([cx, cz])
        }
      }

      // Drop out-of-range chunks. Flush any pending save so edits don't
      // vanish, and clear the chunk's local-edit bookkeeping.
      let removed = false
      for (const key of state.chunks.keys()) {
        if (!keepKeys.has(key)) {
          nextChunks.delete(key)
          flushSave(key)
          dirtyTimers.delete(key)
          localEdited.delete(key)
          removed = true
        }
      }

      // Skip the state update (and its re-render) entirely if the loaded set
      // is unchanged AND no new fetches are starting — the player is standing
      // still inside the same chunks.
      if (!removed && newChunks.length === 0) return state

      // Kick off background fetches for the newly-generated chunks. Done
      // AFTER set() returns synchronously (so the placeholder Map is committed
      // first) — React unmounts/mounts <Chunk> based on this Map, and we
      // don't want to block that on network I/O.
      if (newChunks.length > 0) {
        queueMicrotask(() => {
          for (const [cx, cz] of newChunks) loadChunk(cx, cz)
        })
      }

      return {
        chunks: nextChunks,
        pendingCount: state.pendingCount + newChunks.length,
      }
    }),

  setBlock: (wx, wy, wz, id) =>
    set((state) => {
      if (wy < 0 || wy >= CHUNK_SIZE) return state // y single-layer for now
      const chunkX = worldToChunk(wx)
      const chunkZ = worldToChunk(wz)
      const key = chunkKey(chunkX, chunkZ)
      const oldChunk = state.chunks.get(key)
      if (!oldChunk) return state // chunk not loaded → ignore edit

      const newChunk: ChunkData = { data: new Uint8Array(oldChunk.data) }
      const lx = worldToLocal(wx, chunkX)
      const lz = worldToLocal(wz, chunkZ)
      setChunkBlock(newChunk, lx, wy, lz, id)

      const nextChunks = new Map(state.chunks)
      nextChunks.set(key, newChunk)

      // Force the 1 relevant neighbour chunk to rebuild its culling when the
      // edit touches a chunk border (cross-chunk hidden-block exposure).
      const tryCloneNeighbour = (nChunkX: number, nChunkZ: number) => {
        const nKey = chunkKey(nChunkX, nChunkZ)
        const n = nextChunks.get(nKey)
        if (!n) return
        nextChunks.set(nKey, { data: n.data })
      }
      if (lx === 0) tryCloneNeighbour(chunkX - 1, chunkZ)
      if (lx === CHUNK_SIZE - 1) tryCloneNeighbour(chunkX + 1, chunkZ)
      if (lz === 0) tryCloneNeighbour(chunkX, chunkZ - 1)
      if (lz === CHUNK_SIZE - 1) tryCloneNeighbour(chunkX, chunkZ + 1)

      // Persistence: this chunk is now authoritative-local (don't let a still-
      // in-flight fetch clobber it) and we start / restart the save debounce.
      localEdited.add(key)
      scheduleSave(chunkX, chunkZ)

      return { chunks: nextChunks }
    }),
}))

export { createChunk, CHUNK_SIZE, CHUNK_VOLUME }