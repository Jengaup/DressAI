import { supabase } from '@lib/supabase/client';
import type { Garment, OutfitWithGarments } from '@types/database';

interface GenerateOutfitParams {
  garments: Garment[];
  occasion: string;
  weather?: { temp_c: number; condition: string };
}

interface GeneratedOutfitSuggestion {
  garment_ids: string[];
  reasoning: string;
  occasion_fit: number;
  color_harmony: string;
}

/**
 * Calls the Supabase Edge Function that proxies Claude claude-haiku-4-5.
 * The API key stays server-side; we never expose it to the client.
 */
export async function generateOutfit(
  params: GenerateOutfitParams,
): Promise<OutfitWithGarments[]> {
  const { data, error } = await supabase.functions.invoke<{
    outfits: GeneratedOutfitSuggestion[];
  }>('generate-outfit', {
    body: {
      garments: params.garments.map((g) => ({
        id: g.id,
        type: g.type,
        color_label: g.color_label,
        primary_color: g.primary_color,
        pattern: g.pattern,
        occasions: g.occasions,
        season: g.season,
        name: g.name ?? g.type,
      })),
      occasion: params.occasion,
      weather: params.weather,
    },
  });

  if (error) throw new Error(`Edge Function error: ${error.message}`);
  if (!data?.outfits) throw new Error('Invalid response from outfit generator');

  // Map suggestions → OutfitWithGarments (unsaved, temporary IDs)
  return data.outfits.map((suggestion, i) => {
    const matchedGarments = params.garments.filter((g) =>
      suggestion.garment_ids.includes(g.id),
    );

    return {
      id: `temp-${Date.now()}-${i}`,
      user_id: '',
      name: null,
      preview_url: null,
      occasion: params.occasion,
      season: null,
      rating: null,
      notes: suggestion.reasoning,
      is_favorite: false,
      times_worn: 0,
      source: 'ai_generated' as const,
      ai_prompt: params.occasion,
      ai_reasoning: suggestion.reasoning,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      outfit_garments: matchedGarments.map((g, idx) => ({
        outfit_id: `temp-${Date.now()}-${i}`,
        garment_id: g.id,
        position: { x: 0, y: 0, scale: 1, rotation: 0, zIndex: idx },
        garment: g,
      })),
    };
  });
}
