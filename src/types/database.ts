export type GarmentType =
  | 'top' | 'bottom' | 'dress' | 'outerwear'
  | 'shoes' | 'bag' | 'accessory' | 'activewear'
  | 'swimwear' | 'underwear';

export type GarmentSeason = 'spring' | 'summer' | 'fall' | 'winter' | 'all';
export type CalendarEntryType = 'worn' | 'planned';
export type OutfitSource = 'manual' | 'ai_generated';

export interface Profile {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  style_prefs: StylePreferences;
  onboarding_done: boolean;
  created_at: string;
  updated_at: string;
}

export interface StylePreferences {
  preferred_styles: string[];
  avoided_colors: string[];
  body_type: string | null;
  occasions: string[];
}

export interface Garment {
  id: string;
  user_id: string;
  original_url: string;
  processed_url: string | null;
  thumbnail_url: string | null;
  type: GarmentType;
  subtype: string | null;
  primary_color: string;
  secondary_color: string | null;
  color_label: string;
  pattern: string;
  season: GarmentSeason[];
  occasions: string[];
  brand: string | null;
  name: string | null;
  tags: string[];
  is_favorite: boolean;
  times_worn: number;
  last_worn: string | null;
  purchase_price: number | null;
  purchase_date: string | null;
  notes: string | null;
  is_active: boolean;
  vision_raw: Record<string, unknown> | null;
  ai_confidence: number | null;
  created_at: string;
  updated_at: string;
}

export interface Outfit {
  id: string;
  user_id: string;
  name: string | null;
  preview_url: string | null;
  occasion: string | null;
  season: GarmentSeason | null;
  rating: number | null;
  notes: string | null;
  is_favorite: boolean;
  times_worn: number;
  source: OutfitSource;
  ai_prompt: string | null;
  ai_reasoning: string | null;
  created_at: string;
  updated_at: string;
}

export interface OutfitGarment {
  outfit_id: string;
  garment_id: string;
  position: GarmentPosition;
}

export interface GarmentPosition {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  zIndex: number;
}

export interface CalendarEntry {
  id: string;
  user_id: string;
  outfit_id: string | null;
  date: string;
  type: CalendarEntryType;
  weather: WeatherData | null;
  mood: string | null;
  occasion: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface WeatherData {
  temp_c: number;
  condition: string;
  humidity: number;
}

// ─── Joined types (queries with relations) ───────────────────
export type OutfitWithGarments = Outfit & {
  outfit_garments: (OutfitGarment & { garment: Garment })[];
};

export type CalendarEntryWithOutfit = CalendarEntry & {
  outfit: OutfitWithGarments | null;
};

// ─── API input types ─────────────────────────────────────────
export type CreateGarmentInput = Omit<
  Garment,
  'id' | 'user_id' | 'created_at' | 'updated_at' | 'times_worn' | 'last_worn'
>;

export type UpdateGarmentInput = Partial<
  Pick<Garment,
    | 'name' | 'brand' | 'type' | 'subtype'
    | 'primary_color' | 'secondary_color' | 'color_label'
    | 'pattern' | 'season' | 'occasions' | 'tags'
    | 'is_favorite' | 'is_active' | 'notes'
    | 'purchase_price' | 'purchase_date'
    | 'processed_url' | 'thumbnail_url'
  >
>;

export type CreateOutfitInput = Omit<
  Outfit,
  'id' | 'user_id' | 'created_at' | 'updated_at' | 'times_worn'
> & {
  garment_ids: string[];
};
