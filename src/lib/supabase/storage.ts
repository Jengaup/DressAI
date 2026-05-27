import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { supabase } from './client';

const BUCKET = 'garment-images';

export type ImageVariant = 'original' | 'processed' | 'thumbnail';

/**
 * Builds the storage path: {userId}/{variant}/{garmentId}.webp
 */
export function buildStoragePath(
  userId: string,
  garmentId: string,
  variant: ImageVariant,
): string {
  return `${userId}/${variant}/${garmentId}.webp`;
}

/**
 * Uploads a local file URI to Supabase Storage.
 * Returns the public URL on success.
 */
export async function uploadGarmentImage(
  userId: string,
  garmentId: string,
  localUri: string,
  variant: ImageVariant,
): Promise<string> {
  const path = buildStoragePath(userId, garmentId, variant);

  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, decode(base64), {
      contentType: 'image/webp',
      upsert: true,
    });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  return getSignedUrl(path);
}

/**
 * Returns a signed URL valid for 1 year (garment images are long-lived).
 */
export async function getSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 365);

  if (error || !data) throw new Error(`Failed to sign URL: ${error?.message}`);
  return data.signedUrl;
}

/**
 * Deletes all image variants for a garment.
 */
export async function deleteGarmentImages(
  userId: string,
  garmentId: string,
): Promise<void> {
  const paths: string[] = (
    ['original', 'processed', 'thumbnail'] as ImageVariant[]
  ).map((v) => buildStoragePath(userId, garmentId, v));

  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) throw new Error(`Storage delete failed: ${error.message}`);
}
