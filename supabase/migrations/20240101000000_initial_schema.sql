-- ============================================================
-- Armoire — Initial Schema
-- Run order: extensions → types → tables → indexes → RLS → storage
-- ============================================================

-- ─── Extensions ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- trigram search for garment names

-- ─── Custom Types ────────────────────────────────────────────
CREATE TYPE garment_type AS ENUM (
  'top',
  'bottom',
  'dress',
  'outerwear',
  'shoes',
  'bag',
  'accessory',
  'activewear',
  'swimwear',
  'underwear'
);

CREATE TYPE garment_season AS ENUM (
  'spring',
  'summer',
  'fall',
  'winter',
  'all'
);

CREATE TYPE calendar_entry_type AS ENUM (
  'worn',
  'planned'
);

CREATE TYPE outfit_source AS ENUM (
  'manual',
  'ai_generated'
);

-- ============================================================
-- TABLE: profiles
-- Extends auth.users with app-specific data
-- ============================================================
CREATE TABLE public.profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username        TEXT UNIQUE,
  full_name       TEXT,
  avatar_url      TEXT,
  -- Style preferences stored as structured JSON
  style_prefs     JSONB NOT NULL DEFAULT '{
    "preferred_styles": [],
    "avoided_colors":   [],
    "body_type":        null,
    "occasions":        []
  }'::jsonb,
  onboarding_done BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT username_length CHECK (char_length(username) >= 3 AND char_length(username) <= 30),
  CONSTRAINT username_format CHECK (username ~ '^[a-zA-Z0-9_]+$')
);

COMMENT ON TABLE public.profiles IS 'User profile data extending Supabase auth.users';

-- ============================================================
-- TABLE: garments
-- Core wardrobe item with AI-classified metadata
-- ============================================================
CREATE TABLE public.garments (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Image URLs (populated sequentially during upload pipeline)
  original_url     TEXT NOT NULL,            -- raw photo as uploaded
  processed_url    TEXT,                     -- background removed version
  thumbnail_url    TEXT,                     -- 300x300 for list views

  -- AI Classification (editable by user post-processing)
  type             garment_type NOT NULL,
  subtype          TEXT,                     -- e.g. "crew neck", "skinny", "trench"
  primary_color    TEXT NOT NULL,            -- hex: "#2C3E50"
  secondary_color  TEXT,                     -- hex or NULL
  color_label      TEXT NOT NULL,            -- human-readable: "navy blue"
  pattern          TEXT NOT NULL DEFAULT 'solid', -- solid|striped|plaid|floral|graphic|animal
  season           garment_season[] NOT NULL DEFAULT '{all}',
  occasions        TEXT[] NOT NULL DEFAULT '{}', -- casual|formal|sport|date|work|party

  -- User metadata
  brand            TEXT,
  name             TEXT,                     -- user's custom name, e.g. "Friday blazer"
  tags             TEXT[] NOT NULL DEFAULT '{}',
  is_favorite      BOOLEAN NOT NULL DEFAULT FALSE,
  times_worn       INTEGER NOT NULL DEFAULT 0,
  last_worn        DATE,
  purchase_price   NUMERIC(10, 2),
  purchase_date    DATE,
  notes            TEXT,

  -- Lifecycle
  is_active        BOOLEAN NOT NULL DEFAULT TRUE, -- FALSE = donated/sold/storage

  -- AI raw response stored for potential retraining
  vision_raw       JSONB,
  ai_confidence    NUMERIC(4, 3),            -- 0.000-1.000

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_hex_primary CHECK (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT valid_hex_secondary CHECK (secondary_color IS NULL OR secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT positive_times_worn CHECK (times_worn >= 0),
  CONSTRAINT valid_confidence CHECK (ai_confidence IS NULL OR ai_confidence BETWEEN 0 AND 1)
);

COMMENT ON TABLE public.garments IS 'Individual wardrobe items with AI-classified metadata';
COMMENT ON COLUMN public.garments.vision_raw IS 'Raw Google Vision API response, kept for retraining and debugging';

-- ============================================================
-- TABLE: outfits
-- Named combination of garments
-- ============================================================
CREATE TABLE public.outfits (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  name         TEXT,
  preview_url  TEXT,                         -- flat-lay screenshot or generated image
  occasion     TEXT,
  season       garment_season,
  rating       SMALLINT CHECK (rating BETWEEN 1 AND 5),
  notes        TEXT,
  is_favorite  BOOLEAN NOT NULL DEFAULT FALSE,
  times_worn   INTEGER NOT NULL DEFAULT 0,

  -- AI generation metadata
  source       outfit_source NOT NULL DEFAULT 'manual',
  ai_prompt    TEXT,                         -- original prompt if AI generated
  ai_reasoning TEXT,                         -- Claude's explanation

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT positive_times_worn CHECK (times_worn >= 0)
);

COMMENT ON TABLE public.outfits IS 'Saved outfit combinations, manual or AI-generated';

-- ============================================================
-- TABLE: outfit_garments
-- Junction: which garments belong to an outfit + spatial layout
-- ============================================================
CREATE TABLE public.outfit_garments (
  outfit_id   UUID NOT NULL REFERENCES public.outfits(id) ON DELETE CASCADE,
  garment_id  UUID NOT NULL REFERENCES public.garments(id) ON DELETE RESTRICT,

  -- Planificador visual: position/transform on the flat-lay canvas
  position    JSONB NOT NULL DEFAULT '{
    "x": 0, "y": 0,
    "scale": 1.0,
    "rotation": 0,
    "zIndex": 0
  }'::jsonb,

  PRIMARY KEY (outfit_id, garment_id)
);

COMMENT ON TABLE public.outfit_garments IS 'Junction table linking outfits to garments with canvas position data';

-- ============================================================
-- TABLE: calendar_entries
-- Daily outfit log: worn history + future planning
-- ============================================================
CREATE TABLE public.calendar_entries (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  outfit_id  UUID REFERENCES public.outfits(id) ON DELETE SET NULL,

  date       DATE NOT NULL,
  type       calendar_entry_type NOT NULL DEFAULT 'worn',

  -- Optional context for AI recommendations
  weather    JSONB,  -- {"temp_c": 18, "condition": "sunny", "humidity": 65}
  mood       TEXT,
  occasion   TEXT,
  notes      TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One outfit per user per day
  UNIQUE (user_id, date)
);

COMMENT ON TABLE public.calendar_entries IS 'Daily outfit log: past worn history and future planned outfits';

-- ============================================================
-- INDEXES
-- ============================================================

-- Garments: most common query patterns
CREATE INDEX idx_garments_user_active   ON public.garments(user_id, is_active);
CREATE INDEX idx_garments_user_type     ON public.garments(user_id, type) WHERE is_active = TRUE;
CREATE INDEX idx_garments_user_color    ON public.garments(user_id, primary_color) WHERE is_active = TRUE;
CREATE INDEX idx_garments_user_favorite ON public.garments(user_id, is_favorite) WHERE is_favorite = TRUE;
CREATE INDEX idx_garments_tags          ON public.garments USING GIN(tags);
CREATE INDEX idx_garments_occasions     ON public.garments USING GIN(occasions);
CREATE INDEX idx_garments_season        ON public.garments USING GIN(season);
CREATE INDEX idx_garments_name_search   ON public.garments USING GIN(name gin_trgm_ops);

-- Outfits
CREATE INDEX idx_outfits_user_favorite  ON public.outfits(user_id, is_favorite) WHERE is_favorite = TRUE;
CREATE INDEX idx_outfits_user_occasion  ON public.outfits(user_id, occasion);
CREATE INDEX idx_outfit_garments_garment ON public.outfit_garments(garment_id);

-- Calendar: range queries are the primary access pattern
CREATE INDEX idx_calendar_user_date     ON public.calendar_entries(user_id, date DESC);
CREATE INDEX idx_calendar_user_outfit   ON public.calendar_entries(user_id, outfit_id) WHERE outfit_id IS NOT NULL;
CREATE INDEX idx_calendar_user_month    ON public.calendar_entries(user_id, date_trunc('month', date));

-- ============================================================
-- FUNCTIONS: auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_garments_updated_at
  BEFORE UPDATE ON public.garments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_outfits_updated_at
  BEFORE UPDATE ON public.outfits
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_calendar_updated_at
  BEFORE UPDATE ON public.calendar_entries
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- FUNCTION: auto-create profile on signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- FUNCTION: increment times_worn when calendar entry is created
-- ============================================================
CREATE OR REPLACE FUNCTION public.increment_outfit_worn_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type = 'worn' AND NEW.outfit_id IS NOT NULL THEN
    UPDATE public.outfits
    SET times_worn = times_worn + 1,
        updated_at = NOW()
    WHERE id = NEW.outfit_id;

    -- Also update all garments in that outfit
    UPDATE public.garments g
    SET times_worn = g.times_worn + 1,
        last_worn  = NEW.date,
        updated_at = NOW()
    FROM public.outfit_garments og
    WHERE og.outfit_id = NEW.outfit_id
      AND og.garment_id = g.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_calendar_entry_worn
  AFTER INSERT ON public.calendar_entries
  FOR EACH ROW EXECUTE FUNCTION public.increment_outfit_worn_count();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outfits          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outfit_garments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_entries ENABLE ROW LEVEL SECURITY;

-- ── profiles ─────────────────────────────────────────────────
CREATE POLICY "profiles: owner read"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles: owner update"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- No INSERT: handled by handle_new_user() trigger (SECURITY DEFINER)
-- No DELETE: account deletion handled via auth.users cascade

-- ── garments ─────────────────────────────────────────────────
CREATE POLICY "garments: owner all"
  ON public.garments FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── outfits ──────────────────────────────────────────────────
CREATE POLICY "outfits: owner all"
  ON public.outfits FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── outfit_garments ──────────────────────────────────────────
-- Users can only manage outfit_garments for their own outfits
CREATE POLICY "outfit_garments: owner all"
  ON public.outfit_garments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.outfits
      WHERE outfits.id = outfit_garments.outfit_id
        AND outfits.user_id = auth.uid()
    )
  );

-- ── calendar_entries ─────────────────────────────────────────
CREATE POLICY "calendar: owner all"
  ON public.calendar_entries FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- STORAGE BUCKETS
-- Run in Supabase Dashboard → Storage, or via supabase CLI
-- ============================================================

-- Bucket: garment-images (private, user-scoped)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'garment-images',
  'garment-images',
  FALSE,
  10485760, -- 10MB per file
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- Bucket: avatars (public)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  TRUE,
  2097152, -- 2MB
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- ── Storage RLS: garment-images ──────────────────────────────
-- Path convention: {user_id}/{original|processed|thumbnail}/{garment_id}.{ext}

CREATE POLICY "garment-images: owner read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'garment-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "garment-images: owner insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'garment-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "garment-images: owner update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'garment-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "garment-images: owner delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'garment-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ── Storage RLS: avatars (public read, owner write) ──────────
CREATE POLICY "avatars: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars: owner insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "avatars: owner update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
