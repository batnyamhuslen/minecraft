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