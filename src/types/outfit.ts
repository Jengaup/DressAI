/**
 * Domain types for the Outfit Generator module.
 * DB schema types live in types/database.ts.
 */

import type { Garment, GarmentSeason, OutfitWithGarments } from './database';

// ─── Generator state machine ──────────────────────────────────────────────────

export type GeneratorStatus = 'idle' | 'generating' | 'success' | 'error';

// ─── Generation preferences (user-controlled filters) ────────────────────────

export interface OutfitGenerationPreferences {
  occasion: string | null;
  season: GarmentSeason | null;
  /** A specific garment ID that must appear in every suggestion */
  pinnedGarmentId: string | null;
  numSuggestions: 1 | 2 | 3;
}

export const DEFAULT_PREFERENCES: OutfitGenerationPreferences = {
  occasion: null,
  season: null,
  pinnedGarmentId: null,
  numSuggestions: 3,
};

// ─── AI suggestion (pre-save, ephemeral) ──────────────────────────────────────

export interface OutfitSuggestion {
  /** Temp ID before persisting. Format: temp-{timestamp}-{index} */
  id: string;
  garments: Garment[];
  name: string;
  tags: string[];
  advice: string;
  color_harmony: ColorHarmonyType;
  occasion_fit: number; // 0–100
  mood: string;
}

export type ColorHarmonyType =
  | 'complementario'
  | 'análogo'
  | 'monocromático'
  | 'neutro'
  | 'triádico';

export const COLOR_HARMONY_LABELS: Record<ColorHarmonyType, string> = {
  complementario: 'Complementario',
  análogo: 'Análogo',
  monocromático: 'Monocromático',
  neutro: 'Neutros',
  triádico: 'Triádico',
};

// ─── Normalized display type (accepted by OutfitCard) ────────────────────────
// Both OutfitSuggestion (unsaved) and OutfitWithGarments (DB) map into this.

export interface DisplayOutfit {
  id: string;
  name: string;
  garments: Garment[];
  tags: string[];
  advice: string | null;
  color_harmony: string | null;
  occasion_fit: number | null;
  mood: string | null;
  is_saved: boolean;
  source: 'ai_generated' | 'manual';
}

export function suggestionToDisplay(s: OutfitSuggestion): DisplayOutfit {
  return {
    id: s.id,
    name: s.name,
    garments: s.garments,
    tags: s.tags,
    advice: s.advice,
    color_harmony: s.color_harmony,
    occasion_fit: s.occasion_fit,
    mood: s.mood,
    is_saved: false,
    source: 'ai_generated',
  };
}

export function savedOutfitToDisplay(o: OutfitWithGarments): DisplayOutfit {
  return {
    id: o.id,
    name: o.name ?? 'Look guardado',
    garments: o.outfit_garments.map((og) => og.garment).filter(Boolean),
    tags: [],
    advice: o.ai_reasoning,
    color_harmony: null,
    occasion_fit: null,
    mood: null,
    is_saved: true,
    source: o.source,
  };
}

// ─── Edge Function request / response shapes ──────────────────────────────────

export interface GenerateOutfitRequest {
  garments: GarmentSummaryForAI[];
  occasion: string;
  season: string;
  num_suggestions: number;
  pinned_garment_id: string | null;
  /** Sorted garment ID arrays of recent generations to avoid repeating */
  exclude_combinations: string[][];
  weather?: { temp_c: number; condition: string };
}

export interface GarmentSummaryForAI {
  id: string;
  type: string;
  name: string;
  color_label: string;
  primary_color: string;
  secondary_color: string | null;
  pattern: string;
  occasions: string[];
  season: string[];
  brand: string | null;
}

export interface GenerateOutfitResponse {
  outfits: RawOutfitFromAI[];
}

export interface RawOutfitFromAI {
  garment_ids: string[];
  name: string;
  tags: string[];
  advice: string;
  color_harmony: string;
  occasion_fit: number;
  mood: string;
}

// ─── Cache ────────────────────────────────────────────────────────────────────

export interface GeneratorCacheEntry {
  suggestions: OutfitSuggestion[];
  generatedAt: number;
}

// ─── Service error ────────────────────────────────────────────────────────────

export type OutfitErrorCode =
  | 'INSUFFICIENT_WARDROBE'
  | 'AI_FAILED'
  | 'RATE_LIMITED'
  | 'SAVE_FAILED'
  | 'INVALID_RESPONSE';

export class OutfitServiceError extends Error {
  constructor(
    public readonly code: OutfitErrorCode,
    message: string,
    public readonly retryAfterMs?: number,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'OutfitServiceError';
  }
}
