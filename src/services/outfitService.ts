import { supabase } from '@lib/supabase/client';
import { uploadGarmentImage } from '@lib/supabase/storage';
import type { Garment, OutfitWithGarments } from '@types/database';
import {
  OutfitServiceError,
  OutfitSuggestion,
  OutfitGenerationPreferences,
  GenerateOutfitRequest,
  GenerateOutfitResponse,
  GarmentSummaryForAI,
} from '@types/outfit';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toGarmentSummary(g: Garment): GarmentSummaryForAI {
  return {
    id: g.id,
    type: g.type,
    name: g.name ?? g.type,
    color_label: g.color_label,
    primary_color: g.primary_color,
    secondary_color: g.secondary_color,
    pattern: g.pattern,
    occasions: g.occasions,
    season: g.season,
    brand: g.brand,
  };
}

/**
 * Builds a stable cache key from garment IDs + preferences.
 * Used by the hook to skip the API when nothing has changed.
 */
export function buildCacheKey(
  garments: Garment[],
  prefs: OutfitGenerationPreferences,
): string {
  const ids = garments.map((g) => g.id).sort().join(',');
  return `${ids}|${prefs.occasion ?? ''}|${prefs.season ?? ''}|${prefs.pinnedGarmentId ?? ''}`;
}

// ─── Primary service functions ────────────────────────────────────────────────

/**
 * Calls the generate-outfit Edge Function and returns structured suggestions.
 *
 * @param garments           Full wardrobe list (RLS-filtered to current user)
 * @param preferences        Occasion / season / pinned piece filters
 * @param excludeHistory     Past garment ID combinations to avoid repeating
 *                           (pass last 10 from the hook's history ref)
 */
export async function generateOutfitWithClaude(
  garments: Garment[],
  preferences: OutfitGenerationPreferences,
  excludeHistory: string[][] = [],
): Promise<OutfitSuggestion[]> {
  if (garments.length < 2) {
    throw new OutfitServiceError(
      'INSUFFICIENT_WARDROBE',
      'Necesitas al menos 2 prendas en tu clóset para generar outfits',
    );
  }

  const requestBody: GenerateOutfitRequest = {
    garments: garments.map(toGarmentSummary),
    occasion: preferences.occasion ?? 'casual',
    season: preferences.season ?? 'all',
    num_suggestions: preferences.numSuggestions,
    pinned_garment_id: preferences.pinnedGarmentId,
    exclude_combinations: excludeHistory.slice(0, 10),
  };

  const { data, error } = await supabase.functions.invoke<GenerateOutfitResponse>(
    'generate-outfit',
    { body: requestBody },
  );

  if (error) {
    // Check for rate limiting from HTTP headers or error message
    const isRateLimit =
      error.message?.includes('429') ||
      error.message?.toLowerCase().includes('rate');

    if (isRateLimit) {
      throw new OutfitServiceError(
        'RATE_LIMITED',
        'Demasiadas solicitudes. Espera unos segundos antes de intentarlo de nuevo.',
        10_000, // retry after 10s
        error,
      );
    }

    throw new OutfitServiceError('AI_FAILED', error.message ?? 'Error al generar outfit', undefined, error);
  }

  if (!data?.outfits || !Array.isArray(data.outfits) || data.outfits.length === 0) {
    throw new OutfitServiceError(
      'INVALID_RESPONSE',
      'La IA no pudo generar combinaciones válidas con las prendas disponibles',
    );
  }

  // Map raw AI response to typed OutfitSuggestion objects
  const garmentMap = new Map(garments.map((g) => [g.id, g]));

  return data.outfits.map((raw, i): OutfitSuggestion => {
    const matchedGarments = raw.garment_ids
      .map((id) => garmentMap.get(id))
      .filter((g): g is Garment => g !== undefined);

    return {
      id: `temp-${Date.now()}-${i}`,
      garments: matchedGarments,
      name: raw.name || `Look ${i + 1}`,
      tags: Array.isArray(raw.tags) ? raw.tags.slice(0, 4) : [],
      advice: raw.advice || '',
      color_harmony: (raw.color_harmony as OutfitSuggestion['color_harmony']) || 'neutro',
      occasion_fit: Math.max(0, Math.min(100, raw.occasion_fit || 75)),
      mood: raw.mood || '',
    };
  });
}

/**
 * Persists an AI-generated suggestion to the database.
 * Also saves the outfit_garments junction rows.
 *
 * @returns  Full OutfitWithGarments record (joined)
 */
export async function saveOutfit(
  suggestion: OutfitSuggestion,
  userId: string,
): Promise<OutfitWithGarments> {
  // ── 1. Insert outfit record ───────────────────────────────────────────────
  const { data: outfit, error: outfitError } = await supabase
    .from('outfits')
    .insert({
      user_id: userId,
      name: suggestion.name,
      source: 'ai_generated',
      ai_reasoning: suggestion.advice,
      ai_prompt: suggestion.mood,
      notes: suggestion.tags.join(', '),
    })
    .select()
    .single();

  if (outfitError || !outfit) {
    throw new OutfitServiceError(
      'SAVE_FAILED',
      outfitError?.message ?? 'No se pudo guardar el outfit',
      undefined,
      outfitError,
    );
  }

  // ── 2. Insert junction rows ───────────────────────────────────────────────
  const junctionRows = suggestion.garments.map((g, idx) => ({
    outfit_id: outfit.id,
    garment_id: g.id,
    position: { x: 0, y: 0, scale: 1, rotation: 0, zIndex: idx },
  }));

  const { error: junctionError } = await supabase
    .from('outfit_garments')
    .insert(junctionRows);

  if (junctionError) {
    // Clean up the orphaned outfit
    await supabase.from('outfits').delete().eq('id', outfit.id);
    throw new OutfitServiceError(
      'SAVE_FAILED',
      junctionError.message,
      undefined,
      junctionError,
    );
  }

  // ── 3. Return joined record ───────────────────────────────────────────────
  return {
    ...outfit,
    outfit_garments: suggestion.garments.map((g, idx) => ({
      outfit_id: outfit.id,
      garment_id: g.id,
      position: { x: 0, y: 0, scale: 1, rotation: 0, zIndex: idx },
      garment: g,
    })),
  } as OutfitWithGarments;
}

/**
 * Fetches all saved outfits for the current user (RLS-enforced).
 */
export async function getOutfits(): Promise<OutfitWithGarments[]> {
  const { data, error } = await supabase
    .from('outfits')
    .select(`
      *,
      outfit_garments (
        *,
        garment:garments (*)
      )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    throw new OutfitServiceError('SAVE_FAILED', error.message, undefined, error);
  }

  return (data ?? []) as OutfitWithGarments[];
}

/**
 * Hard-deletes an outfit and all its junction rows (cascade).
 */
export async function deleteOutfit(id: string): Promise<void> {
  const { error } = await supabase.from('outfits').delete().eq('id', id);
  if (error) {
    throw new OutfitServiceError('SAVE_FAILED', error.message, undefined, error);
  }
}

/**
 * Streaming variant — yields text deltas via async generator.
 * Uses direct fetch (not supabase.functions.invoke) to access ReadableStream.
 *
 * Usage:
 *   for await (const chunk of streamOutfitGeneration(...)) {
 *     if (chunk.delta) setStreamedText(t => t + chunk.delta)
 *     if (chunk.result) handleFinalResult(chunk.result)
 *   }
 */
export async function* streamOutfitGeneration(
  garments: Garment[],
  preferences: OutfitGenerationPreferences,
  supabaseUrl: string,
  accessToken: string,
): AsyncGenerator<{ delta?: string; result?: GenerateOutfitResponse; error?: string }> {
  const requestBody: GenerateOutfitRequest = {
    garments: garments.map(toGarmentSummary),
    occasion: preferences.occasion ?? 'casual',
    season: preferences.season ?? 'all',
    num_suggestions: preferences.numSuggestions,
    pinned_garment_id: preferences.pinnedGarmentId,
    exclude_combinations: [],
  };

  const response = await fetch(
    `${supabaseUrl}/functions/v1/generate-outfit?stream=true`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    },
  );

  if (!response.ok) {
    yield { error: `HTTP ${response.status}` };
    return;
  }

  if (!response.body) {
    yield { error: 'No response body' };
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE lines
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // keep incomplete line in buffer

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();

        if (payload === '[DONE]') return;

        try {
          const parsed = JSON.parse(payload);
          yield parsed;
        } catch {
          // Malformed SSE line — skip
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
