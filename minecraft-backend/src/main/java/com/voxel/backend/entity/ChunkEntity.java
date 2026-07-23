package com.voxel.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.sql.Timestamp;
import java.time.Instant;

/**
 * ChunkEntity
 * ----------
 * One row per (worldId, chunkX, chunkZ). blockData holds the raw 16^3 = 4096
 * voxel bytes from the frontend, stored as PostgreSQL BYTEA (one byte per
 * voxel, layout x + z*16 + y*16*16 — identical to the client's Uint8Array).
 *
 * No Lombok: getters/setters are explicit per project conventions.
 *
 * updatedAt is maintained by lifecycle callbacks (@PrePersist / @PreUpdate) so
 * callers don't have to remember to stamp it on every write.
 */
@Entity
@Table(
        name = "chunks",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_chunks_world_x_z",
                columnNames = {"world_id", "chunk_x", "chunk_z"}
        ),
        indexes = @Index(
                name = "idx_chunks_world_x_z",
                columnList = "world_id, chunk_x, chunk_z"
        )
)
public class ChunkEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "world_id", nullable = false)
    private String worldId;

    @Column(name = "chunk_x", nullable = false)
    private Integer chunkX;

    @Column(name = "chunk_z", nullable = false)
    private Integer chunkZ;

    @Column(name = "block_data", nullable = false)
    private byte[] blockData;

    @Column(name = "updated_at", nullable = false)
    private Timestamp updatedAt;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getWorldId() {
        return worldId;
    }

    public void setWorldId(String worldId) {
        this.worldId = worldId;
    }

    public Integer getChunkX() {
        return chunkX;
    }

    public void setChunkX(Integer chunkX) {
        this.chunkX = chunkX;
    }

    public Integer getChunkZ() {
        return chunkZ;
    }

    public void setChunkZ(Integer chunkZ) {
        this.chunkZ = chunkZ;
    }

    public byte[] getBlockData() {
        return blockData;
    }

    public void setBlockData(byte[] blockData) {
        this.blockData = blockData;
    }

    public Timestamp getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Timestamp updatedAt) {
        this.updatedAt = updatedAt;
    }

    @PrePersist
    @PreUpdate
    protected void touchTimestamp() {
        this.updatedAt = Timestamp.from(Instant.now());
    }
}