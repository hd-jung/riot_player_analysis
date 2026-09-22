CREATE TABLE IF NOT EXISTS player_profiles (
    id BIGSERIAL PRIMARY KEY,
    riot_id TEXT NOT NULL,
    riot_id_normalized TEXT GENERATED ALWAYS AS (LOWER(riot_id)) STORED,
    routing TEXT NOT NULL CHECK (routing IN ('americas', 'europe', 'asia', 'sea')),
    consent_confirmed_at TIMESTAMPTZ,
    first_analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS player_profiles_identity_idx
ON player_profiles (riot_id_normalized, routing);

CREATE TABLE IF NOT EXISTS analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id BIGINT NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    match_count INTEGER NOT NULL,
    summary JSONB NOT NULL,
    benchmark JSONB NOT NULL,
    training_plan JSONB NOT NULL,
    routine_token_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS analyses_player_time_idx
ON analyses (player_id, analyzed_at DESC);

CREATE TABLE IF NOT EXISTS match_snapshots (
    id BIGSERIAL PRIMARY KEY,
    analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    match_id TEXT NOT NULL,
    played_at TIMESTAMPTZ,
    champion TEXT NOT NULL,
    role TEXT NOT NULL,
    won BOOLEAN NOT NULL,
    score TEXT NOT NULL,
    kda NUMERIC(8,2) NOT NULL,
    cs INTEGER NOT NULL,
    duration_minutes INTEGER NOT NULL,
    coach_note TEXT NOT NULL,
    UNIQUE (analysis_id, match_id)
);

CREATE TABLE IF NOT EXISTS routine_completions (
    id BIGSERIAL PRIMARY KEY,
    analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 7),
    task TEXT NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (analysis_id, day)
);

CREATE TABLE IF NOT EXISTS public_cohort (
    id BIGSERIAL PRIMARY KEY,
    riot_id TEXT NOT NULL,
    routing TEXT NOT NULL DEFAULT 'americas',
    status TEXT NOT NULL DEFAULT 'candidate',
    last_verified_at TIMESTAMPTZ,
    UNIQUE (riot_id, routing)
);

INSERT INTO public_cohort (riot_id, routing) VALUES
('Tanzeem#GOAT', 'americas'),
('miori#mew', 'americas'),
('corset#covet', 'americas'),
('Egoist#ADC', 'americas'),
('Ix Fallen xl#NA1', 'americas'),
('Boii3532#8814', 'americas'),
('lights#0712', 'americas'),
('Whip It Out#Demon', 'americas'),
('Kargan#CBRS3', 'americas'),
('Bottle Incident#1985', 'americas')
ON CONFLICT (riot_id, routing) DO NOTHING;
