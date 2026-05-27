import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '@lib/supabase/client';
import { uploadGarmentImage } from '@lib/supabase/storage';
import type { Garment } from '@types/database';
import {
  GarmentServiceError,
  ClassificationResult,
  ProcessImageResult,
  SaveGarmentInput,
  GarmentFilter,
  GarmentSortField,
} from '@types/garment';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function uriToBase64(uri: string): Promise<string> {
  return FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

async function compressImage(uri: string, maxWidth = 1200): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxWidth } }],
    { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
}

async function writeToCacheDir(base64: string, filename: string): Promise<string> {
  const path = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(path, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return path;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Removes the background from a local image URI.
 * Compresses first, calls the process-image Edge Function, writes
 * the result to the local cache dir, and returns a local file URI.
 *
 * @param imageUri  Local file URI (from camera or gallery)
 * @returns         Local URI of the processed PNG (background removed)
 */
export async function uploadToRemoveBg(imageUri: string): Promise<string> {
  let compressedUri: string;

  try {
    compressedUri = await compressImage(imageUri);
  } catch (cause) {
    throw new GarmentServiceError(
      'REMOVE_BG_FAILED',
      'No se pudo comprimir la imagen antes de procesarla',
      cause,
    );
  }

  const base64 = await uriToBase64(compressedUri);

  const { data, error } = await supabase.functions.invoke<ProcessImageResult>(
    'process-image',
    { body: { imageBase64: base64, mimeType: 'image/jpeg' } },
  );

  if (error || !data) {
    throw new GarmentServiceError(
      'REMOVE_BG_FAILED',
      error?.message ?? 'La eliminación de fondo falló sin respuesta',
      error,
    );
  }

  try {
    return await writeToCacheDir(
      data.processedBase64,
      `bg-removed-${Date.now()}.png`,
    );
  } catch (cause) {
    throw new GarmentServiceError(
      'REMOVE_BG_FAILED',
      'No se pudo guardar la imagen procesada en caché',
      cause,
    );
  }
}

/**
 * Classifies a garment photo using Google Vision (via Edge Function).
 * Compresses the image before sending.
 *
 * @param imageUri  Local file URI
 * @returns         Structured classification data
 */
export async function classifyWithVision(
  imageUri: string,
): Promise<ClassificationResult> {
  let base64: string;

  try {
    const compressedUri = await compressImage(imageUri);
    base64 = await uriToBase64(compressedUri);
  } catch (cause) {
    throw new GarmentServiceError(
      'CLASSIFY_FAILED',
      'No se pudo preparar la imagen para clasificación',
      cause,
    );
  }

  const { data, error } = await supabase.functions.invoke<ClassificationResult>(
    'classify-garment',
    { body: { imageBase64: base64, mimeType: 'image/jpeg' } },
  );

  if (error || !data) {
    throw new GarmentServiceError(
      'CLASSIFY_FAILED',
      error?.message ?? 'La clasificación con IA no retornó resultados',
      error,
    );
  }

  return data;
}

/**
 * Full save pipeline:
 * 1. Uploads original + processed images to Supabase Storage
 * 2. Generates a thumbnail from the processed image
 * 3. INSERTs the garment record
 *
 * @returns  Persisted Garment record with all fields populated
 */
export async function saveGarment(
  input: SaveGarmentInput,
  userId: string,
): Promise<Garment> {
  const garmentId = crypto.randomUUID();

  // ── 1. Upload images ──────────────────────────────────────────────────────
  let originalUrl: string;
  let processedUrl: string | null = null;
  let thumbnailUrl: string | null = null;

  try {
    originalUrl = await uploadGarmentImage(userId, garmentId, input.originalUri, 'original');

    if (input.processedUri) {
      processedUrl = await uploadGarmentImage(userId, garmentId, input.processedUri, 'processed');

      // Re-use processed as thumbnail (Supabase transforms resize on-the-fly via URL params)
      thumbnailUrl = processedUrl;
    } else {
      thumbnailUrl = originalUrl;
    }
  } catch (cause) {
    throw new GarmentServiceError(
      'UPLOAD_FAILED',
      'No se pudieron subir las imágenes al almacenamiento',
      cause,
    );
  }

  // ── 2. Merge AI classification with user overrides ────────────────────────
  const { classification: ai, overrides } = input;

  const record = {
    id: garmentId,
    user_id: userId,
    original_url: originalUrl,
    processed_url: processedUrl,
    thumbnail_url: thumbnailUrl,
    // User overrides take precedence over AI results
    type: overrides.type ?? ai.type,
    subtype: ai.subtype,
    primary_color: overrides.primary_color || ai.primary_color,
    secondary_color: overrides.secondary_color || ai.secondary_color || null,
    color_label: (overrides.color_label || ai.color_label).trim() || 'color',
    pattern: overrides.pattern || ai.pattern,
    season: overrides.season.length > 0 ? overrides.season : ai.season,
    occasions: overrides.occasions.length > 0 ? overrides.occasions : ai.occasions,
    brand: overrides.brand.trim() || null,
    name: overrides.name.trim() || null,
    tags: overrides.tags,
    notes: overrides.notes.trim() || null,
    purchase_price: overrides.purchase_price
      ? parseFloat(overrides.purchase_price)
      : null,
    purchase_date: overrides.purchase_date || null,
    is_favorite: false,
    times_worn: 0,
    last_worn: null,
    is_active: true,
    vision_raw: ai.vision_raw,
    ai_confidence: ai.ai_confidence,
  };

  // ── 3. Persist to DB ──────────────────────────────────────────────────────
  const { data, error } = await supabase
    .from('garments')
    .insert(record)
    .select()
    .single();

  if (error || !data) {
    throw new GarmentServiceError(
      'DB_INSERT_FAILED',
      error?.message ?? 'No se pudo guardar la prenda en la base de datos',
      error,
    );
  }

  return data as Garment;
}

/**
 * Fetches the authenticated user's active garments with optional filtering.
 * RLS ensures results are scoped to the current user automatically.
 */
export async function getGarments(
  filter: GarmentFilter = {},
): Promise<Garment[]> {
  let query = supabase
    .from('garments')
    .select('*')
    .eq('is_active', true);

  if (filter.type) {
    query = query.eq('type', filter.type);
  }
  if (filter.season) {
    query = query.contains('season', [filter.season]);
  }
  if (filter.occasion) {
    query = query.contains('occasions', [filter.occasion]);
  }
  if (filter.favoritesOnly) {
    query = query.eq('is_favorite', true);
  }
  if (filter.searchQuery?.trim()) {
    const q = filter.searchQuery.trim();
    // Trigram-indexed search across name, brand and color_label
    query = query.or(
      `name.ilike.%${q}%,brand.ilike.%${q}%,color_label.ilike.%${q}%,type.ilike.%${q}%`,
    );
  }

  // Sorting
  const sort = filter.sortBy ?? 'newest';
  switch (sort) {
    case 'newest':
      query = query.order('created_at', { ascending: false });
      break;
    case 'oldest':
      query = query.order('created_at', { ascending: true });
      break;
    case 'most_worn':
      query = query.order('times_worn', { ascending: false });
      break;
    case 'recently_worn':
      query = query
        .not('last_worn', 'is', null)
        .order('last_worn', { ascending: false });
      break;
    case 'name':
      query = query.order('name', { ascending: true, nullsFirst: false });
      break;
  }

  const { data, error } = await query;

  if (error) {
    throw new GarmentServiceError(
      'DB_FETCH_FAILED',
      error.message,
      error,
    );
  }

  return (data ?? []) as Garment[];
}

/**
 * Soft-deletes a garment (sets is_active = false).
 * Hard delete via cascade only on account deletion.
 */
export async function deleteGarment(id: string): Promise<void> {
  const { error } = await supabase
    .from('garments')
    .update({ is_active: false })
    .eq('id', id);

  if (error) {
    throw new GarmentServiceError(
      'DB_DELETE_FAILED',
      error.message,
      error,
    );
  }
}

/**
 * Updates mutable garment fields. Only provided keys are changed.
 */
export async function updateGarment(
  id: string,
  updates: Partial<Pick<Garment,
    | 'name' | 'brand' | 'type' | 'subtype'
    | 'primary_color' | 'secondary_color' | 'color_label'
    | 'pattern' | 'season' | 'occasions' | 'tags'
    | 'is_favorite' | 'is_active' | 'notes'
    | 'purchase_price' | 'purchase_date'
    | 'processed_url' | 'thumbnail_url'
  >>,
): Promise<Garment> {
  const { data, error } = await supabase
    .from('garments')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error || !data) {
    throw new GarmentServiceError(
      'DB_INSERT_FAILED',
      error?.message ?? 'No se pudo actualizar la prenda',
      error,
    );
  }

  return data as Garment;
}
