import type { GarmentType } from '@types/database';

export const COLORS = {
  // Brand
  primary: '#6C5CE7',
  primaryLight: '#A29BFE',
  accent: '#00CEC9',

  // Background hierarchy
  background: '#0F0F0F',
  surface: '#1A1A1A',
  surfaceAlt: '#242424',
  border: '#2C2C2C',

  // Text
  text: '#F5F5F5',
  textSecondary: '#AAAAAA',
  textMuted: '#666666',

  // Semantic
  success: '#00B894',
  warning: '#FDCB6E',
  error: '#E17055',
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const GARMENT_TYPE_LABELS: Record<GarmentType, string> = {
  top: 'Top',
  bottom: 'Pantalón / Falda',
  dress: 'Vestido',
  outerwear: 'Abrigo',
  shoes: 'Zapatos',
  bag: 'Bolso',
  accessory: 'Accesorio',
  activewear: 'Ropa deportiva',
  swimwear: 'Traje de baño',
  underwear: 'Ropa interior',
};

export const OCCASION_LABELS: Record<string, string> = {
  casual: 'Casual',
  work: 'Trabajo',
  formal: 'Formal',
  sport: 'Deporte',
  date: 'Cita',
  party: 'Fiesta',
  beach: 'Playa',
};

export const PATTERN_LABELS: Record<string, string> = {
  solid: 'Liso',
  striped: 'Rayas',
  plaid: 'Cuadros',
  floral: 'Floral',
  graphic: 'Estampado',
  animal: 'Animal print',
  abstract: 'Abstracto',
};
