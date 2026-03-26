-- Enrichir la table boards avec les nouveaux champs pour le Quiver
ALTER TABLE boards ADD COLUMN IF NOT EXISTS nickname TEXT;
ALTER TABLE boards ADD COLUMN IF NOT EXISTS length_ft TEXT;
ALTER TABLE boards ADD COLUMN IF NOT EXISTS width_in TEXT;
ALTER TABLE boards ADD COLUMN IF NOT EXISTS thickness_in TEXT;
ALTER TABLE boards ADD COLUMN IF NOT EXISTS volume_l REAL;
ALTER TABLE boards ADD COLUMN IF NOT EXISTS tail_shape TEXT;
ALTER TABLE boards ADD COLUMN IF NOT EXISTS fins_setup TEXT;
ALTER TABLE boards ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE boards ADD COLUMN IF NOT EXISTS year_made INTEGER;
ALTER TABLE boards ADD COLUMN IF NOT EXISTS condition TEXT DEFAULT 'bon';
ALTER TABLE boards ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE boards ADD COLUMN IF NOT EXISTS sweet_spot_wave_min REAL;
ALTER TABLE boards ADD COLUMN IF NOT EXISTS sweet_spot_wave_max REAL;
ALTER TABLE boards ADD COLUMN IF NOT EXISTS sweet_spot_wind TEXT DEFAULT 'any';
ALTER TABLE boards ADD COLUMN IF NOT EXISTS sweet_spot_tide TEXT DEFAULT 'any';
ALTER TABLE boards ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Migrer les données existantes
UPDATE boards SET nickname = name WHERE nickname IS NULL;
UPDATE boards SET length_ft = size WHERE length_ft IS NULL;
