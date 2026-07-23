package com.voxel.backend.repository;

import com.voxel.backend.entity.ChunkEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/**
 * ChunkRepository
 * --------------
 * Spring Data JPA derived query: the method name is parsed into a
 * "select c from ChunkEntity c where c.worldId=? and c.chunkX=? and c.chunkZ=?"
 * — no @Query needed. The (world_id, chunk_x, chunk_z) triple is also the
 * unique index created by V1__create_chunks_table.sql, so lookups are indexed.
 */
@Repository
public interface ChunkRepository extends JpaRepository<ChunkEntity, Long> {

    Optional<ChunkEntity> findByWorldIdAndChunkXAndChunkZ(
            String worldId, Integer chunkX, Integer chunkZ);
}