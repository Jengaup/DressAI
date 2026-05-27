/**
 * Domain-level types for the garment module.
 * DB-schema types live in types/database.ts — these extend them
 * with upload pipeline, form, and filter shapes.
 */

import type { Garment, GarmentType, GarmentSeason } from './database';

// Re-export for single-import convenience in the module
export type { Garment, GarmentType, GarmentSeason };

// ─── Upload pipeline ──────────────────────────────────────────────────────────

export type UploadStage =
  | 'idle'
  | 'compressing'
  | 'removing-bg'
  | 'classifying'
  | 'uploading'
  | 'saving'
  | 'done'
  | 'error';

export interface UploadProgress {
  stage: UploadStage;
  /** 0-100 */
  percent: number;
  message: string;
  error?: string;
}

export const UPLOAD_STAGE_MESSAGES: Record<UploadStage, string> = {
  idle: '',
  compressing: 'Comprimiendo imagen...',
  'removing-bg': 'Recortando fondo...',
  classifying: 'Clasificando prenda con IA...',
  uploading: 'Subiendo al clóset...',
  saving: 'Guardando...',
  done: '¡Listo!',
  error: 'Ocurrió un error',
};

export const UPLOAD_STAGE_PERCENT: Record<UploadStage, number> = {
  idle: 0,
  compressing: 10,
  'removing-bg': 30,
  classifying: 55,
  uploading: 75,
  saving: 90,
  done: 100,
  error: 0,
};

// ─── AI classification ────────────────────────────────────────────────────────

/** Typed response from the classify-garment Edge Function */
export interface ClassificationResult {
  type: GarmentType;
  subtype: string | null;
  primary_color: string;
  secondary_color: string | null;
  color_label: string;
  pattern: string;
  occasions: string[];
  season: GarmentSeason[];
  ai_confidence: number;
  vision_raw: Record<string, unknown>;
}

/** Typed response from the process-image Edge Function */
export interface ProcessImageResult {
  processedBase64: string;
  mimeType: string;
  creditsCharged: string | null;
}

// ─── Service input/output ─────────────────────────────────────────────────────

/**
 * Everything garmentService.saveGarment needs.
 * - Local URIs (not yet uploaded)
 * - AI classification result
 * - User's manual overrides from the form
 */
export interface SaveGarmentInput {
  originalUri: string;
  processedUri: string | null;
  classification: ClassificationResult;
  overrides: GarmentFormData;
}

/**
 * What the user fills in on the AddGarmentScreen form.
 * All fields optional so they can be partially pre-filled by AI.
 */
export interface GarmentFormData {
  type: GarmentType;
  name: string;
  brand: string;
  color_label: string;
  primary_color: string;
  secondary_color: string;
  pattern: string;
  occasions: string[];
  season: GarmentSeason[];
  tags: string[];
  notes: string;
  purchase_price: string; // string in form, number on save
  purchase_date: string;  // ISO date string or ''
}

export const DEFAULT_FORM_DATA: GarmentFormData = {
  type: 'top',
  name: '',
  brand: '',
  color_label: '',
  primary_color: '#888888',
  secondary_color: '',
  pattern: 'solid',
  occasions: ['casual'],
  season: ['all'],
  tags: [],
  notes: '',
  purchase_price: '',
  purchase_date: '',
};

// ─── Filtering & sorting ──────────────────────────────────────────────────────

export type GarmentSortField =
  | 'newest'
  | 'oldest'
  | 'most_worn'
  | 'recently_worn'
  | 'name';

export interface GarmentFilter {
  type?: GarmentType | null;
  season?: GarmentSeason | null;
  occasion?: string | null;
  searchQuery?: string;
  favoritesOnly?: boolean;
  sortBy?: GarmentSortField;
}

// ─── Wardrobe statistics ──────────────────────────────────────────────────────

export interface WardrobeStats {
  total: number;
  byType: Partial<Record<GarmentType, number>>;
  favorites: number;
  addedThisMonth: number;
  mostWorn: Garment | null;
}

// ─── Service-level errors ─────────────────────────────────────────────────────

export type GarmentErrorCode =
  | 'REMOVE_BG_FAILED'
  | 'CLASSIFY_FAILED'
  | 'UPLOAD_FAILED'
  | 'DB_INSERT_FAILED'
  | 'DB_FETCH_FAILED'
  | 'DB_DELETE_FAILED'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED';

export class GarmentServiceError extends Error {
  constructor(
    public readonly code: GarmentErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'GarmentServiceError';
  }
}
