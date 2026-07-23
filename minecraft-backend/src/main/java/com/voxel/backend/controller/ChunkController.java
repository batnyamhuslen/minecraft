package com.voxel.backend.controller;

import com.voxel.backend.entity.ChunkEntity;
import com.voxel.backend.repository.ChunkRepository;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Optional;

/**
 * ChunkController
 * --------------
 * REST endpoints for per-chunk voxel persistence. Wire format is the raw 4096
 * byte chunk array (application/octet-stream) — no JSON wrapping — so the
 * frontend can POST a Uint8Array body directly and GET one back as an
 * ArrayBuffer.
 *
 *   GET  /api/chunks/{worldId}/{chunkX}/{chunkZ}
 *        → 200 application/octet-stream (raw bytes)
 *        → 404 if no chunk has ever been saved for that triple
 *
 *   POST /api/chunks/{worldId}/{chunkX}/{chunkZ}
 *        ← request body: raw bytes (application/octet-stream)
 *        → 204 No Content on success
 *
 * The POST is an UPSERT: if a row already exists for the (worldId, chunkX,
 * chunkZ) triple we update blockData + updatedAt in place; otherwise we
 * insert a new row. updatedAt is stamped by the entity's @PrePersist /
 * @PreUpdate callbacks, so the controller doesn't touch it.
 */
@RestController
@RequestMapping("/api/chunks")
public class ChunkController {

    private final ChunkRepository chunkRepository;

    public ChunkController(ChunkRepository chunkRepository) {
        this.chunkRepository = chunkRepository;
    }

    @GetMapping("/{worldId}/{chunkX}/{chunkZ}")
    public ResponseEntity<byte[]> getChunk(
            @PathVariable String worldId,
            @PathVariable int chunkX,
            @PathVariable int chunkZ) {

        Optional<ChunkEntity> found =
                chunkRepository.findByWorldIdAndChunkXAndChunkZ(worldId, chunkX, chunkZ);

        if (found.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        byte[] body = found.get().getBlockData();
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(body);
    }

    @PostMapping("/{worldId}/{chunkX}/{chunkZ}")
    public ResponseEntity<Void> saveChunk(
            @PathVariable String worldId,
            @PathVariable int chunkX,
            @PathVariable int chunkZ,
            @RequestBody byte[] blockData) {

        // Upsert: reuse the existing row if one exists, else allocate a new one.
        // Single SELECT then a single INSERT or UPDATE — no races worth guarding
        // here (per-chunk edits come from one player at a time), and a later
        // @Version column could be added if concurrent player edits need it.
        ChunkEntity chunk = chunkRepository
                .findByWorldIdAndChunkXAndChunkZ(worldId, chunkX, chunkZ)
                .orElseGet(() -> {
                    ChunkEntity c = new ChunkEntity();
                    c.setWorldId(worldId);
                    c.setChunkX(chunkX);
                    c.setChunkZ(chunkZ);
                    return c;
                });

        chunk.setBlockData(blockData);
        chunkRepository.save(chunk); // insert if new, update if managed
        return ResponseEntity.noContent().build();
    }
}