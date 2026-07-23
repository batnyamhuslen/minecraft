/**
 * chunks.ts
 * --------
 * Frontend API client for world persistence. Talks to the ( forthcoming )
 * Spring Boot backend over same-origin `/api/chunks/{worldId}/{chunkX}/{chunkZ}`.
 *
 * Wire format: the raw chunk voxel array ( 16³ = 4096 bytes ), one byte per
 * voxel, identical layout to `ChunkData.data` ( x + z*SIZE + y*SIZE*SIZE ).
 * No framing / headers — the body IS the chunk.
 *
 * Error contract:
 *  - 404            → chunk has never been saved → return `null` so the caller
 *                    can fall back to procedural terrain generation.
 *  - network error → `fetch` rejects; `fetchChunk` rethrows so the caller can
 *                    catch and fall back. We deliberately DO NOT swallow here
 *                    so the caller decides policy ( noisy backend-down logging ).
 */

/** API base. Same-origin so Vite dev proxy / prod reverse proxy can map to
 *  the Spring Boot service; no CORS config needed in dev. */
const API_BASE = '/api'

/** Sanity guard: a freshly generated chunk is exactly 16³ bytes. We don't
 *  strictly enforce this server-side contract here, but truncating/padding in
 *  the caller keeps a malformed payload from indexing out of range. */
export const CHUNK_BYTES = 4096

function chunkUrl(worldId: string, chunkX: number, chunkZ: number): string {
  return `${API_BASE}/chunks/${encodeURIComponent(worldId)}/${chunkX}/${chunkZ}`
}

/**
 * Fetch a saved chunk. Resolves to the raw bytes, or `null` if the backend has
 * no record of this chunk (404). Rejects on any other HTTP / network failure so
 * the caller can fall back to local generation.
 */
export async function fetchChunk(
  worldId: string,
  chunkX: number,
  chunkZ: number,
): Promise<Uint8Array | null> {
  const res = await fetch(chunkUrl(worldId, chunkX, chunkZ))
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`fetchChunk: HTTP ${res.status}`)
  const buf = await res.arrayBuffer()
  return new Uint8Array(buf)
}

/**
 * Persist a chunk. Sends the raw voxel bytes as the request body. Rejects on
 * non-2xx; the store layer logs and swallows so a failing backend never breaks
 * gameplay.
 */
export async function saveChunk(
  worldId: string,
  chunkX: number,
  chunkZ: number,
  data: Uint8Array,
): Promise<void> {
  // Copy into a standalone ArrayBuffer so the body type satisfies `BodyInit`
  // unambiguously (the lib.dom typings reject a Uint8Array view whose backing
  // buffer is typed as ArrayBufferLike / possibly SharedArrayBuffer). 4096
  // bytes, so the copy is negligible.
  const body = new ArrayBuffer(data.byteLength)
  new Uint8Array(body).set(data)
  const res = await fetch(chunkUrl(worldId, chunkX, chunkZ), {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body,
  })
  if (!res.ok) throw new Error(`saveChunk: HTTP ${res.status}`)
}

/**
 * Best-effort fire-and-forget save for use on page unload / tab hide. Uses the
 * browser's `sendBeacon` (or `fetch` with `keepalive: true` on browsers that
 * don't expose it / for the cross-browser fallback) so the request can survive
 * the page being torn down. Unlike `saveChunk` this never awaits and never
 * rejects — the page is going away so there's nothing meaningful to do on
 * failure beyond a `console.warn`.
 *
 * sendBeacon has a small max payload cap (~64KB on most user agents) but a chunk
 * is 4096 bytes, and we may send a few at once — still well under the cap.
 *
 * Note: sendBeacon uses the GET-unsafe POST method and inherits the same
 * octet-stream body the regular endpoint expects, so the backend needs no
 * changes.
 */
export function saveChunkSync(
  worldId: string,
  chunkX: number,
  chunkZ: number,
  data: Uint8Array,
): void {
  const url = chunkUrl(worldId, chunkX, chunkZ)
  // Copy the bytes into a fresh ArrayBuffer-backed Uint8Array so the Blob
  // doesn't retain a SharedArrayBuffer-typed view (which Blob rejects in some
  // browser builds).
  const copy = new Uint8Array(data.byteLength)
  copy.set(data)
  const blob = new Blob([copy], { type: 'application/octet-stream' })

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      if (navigator.sendBeacon(url, blob)) return
      // sendBeacon returning false usually means the queue is full / payload
      // too large; fall through to keepalive fetch.
    }
  } catch (err) {
    console.warn('saveChunkSync sendBeacon threw', { chunkX, chunkZ, err })
  }

  // Fallback: a keepalive fetch. The browser will still send it after unload
  // for small bodies (<= 64KB). If that also unsupported we lose the save, but
  // better than crashing.
  try {
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: blob,
      keepalive: true,
    // No .then — we don't inspect the response once the page is going away.
    }).catch(() => {})
  } catch (err) {
    console.warn('saveChunkSync keepalive fetch threw', { chunkX, chunkZ, err })
  }
}