-- V1__create_chunks_table.sql
-- One row per saved chunk. block_data is the raw 16^3 = 4096 voxel byte
-- array from the frontend (one byte per voxel, layout x + z*16 + y*16*16),
-- stored as PostgreSQL BYTEA.

CREATE TABLE chunks
(
    id          BIGSERIAL    NOT NULL,
    world_id    VARCHAR(255) NOT NULL,
    chunk_x     INTEGER      NOT NULL,
    chunk_z     INTEGER      NOT NULL,
    block_data  BYTEA        NOT NULL,
    updated_at  TIMESTAMP    NOT NULL,

    CONSTRAINT pk_chunks PRIMARY KEY (id),
    CONSTRAINT uk_chunks_world_x_z UNIQUE (world_id, chunk_x, chunk_z)
);

-- Composite index backing the (worldId, chunkX, chunkZ) lookup used on every
-- GET/POST. Note the UK above already provides an index; this explicit one is
-- kept identical so the plan/explain stays stable if the UK is ever dropped.
CREATE INDEX idx_chunks_world_x_z
    ON chunks (world_id, chunk_x, chunk_z);