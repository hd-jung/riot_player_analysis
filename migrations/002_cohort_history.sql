ALTER TABLE public_cohort
ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS cohort_matches (
    id BIGSERIAL PRIMARY KEY,
    cohort_id BIGINT NOT NULL REFERENCES public_cohort(id) ON DELETE CASCADE,
    match_id TEXT NOT NULL,
    played_at TIMESTAMPTZ NOT NULL,
    champion TEXT NOT NULL,
    role TEXT NOT NULL,
    won BOOLEAN NOT NULL,
    kills INTEGER NOT NULL,
    deaths INTEGER NOT NULL,
    assists INTEGER NOT NULL,
    kda NUMERIC(8,2) NOT NULL,
    cs INTEGER NOT NULL,
    duration_seconds INTEGER NOT NULL,
    UNIQUE (cohort_id, match_id)
);

CREATE INDEX IF NOT EXISTS cohort_matches_player_time_idx
ON cohort_matches (cohort_id, played_at DESC);
