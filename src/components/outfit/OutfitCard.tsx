/**
 * OutfitCard — reusable card for Generator, Planner and Calendar screens.
 *
 * Accepts either:
 *  - suggestion: OutfitSuggestion  (pre-save, from AI generator)
 *  - outfit: OutfitWithGarments    (persisted DB record)
 *
 * variant='full'    — full featured: collage, tags, advice typewriter, actions
 * variant='compact' — for lists/calendar: thumbnails row + name only
 */

import {
  View, Text, StyleSheet, Pressable, Dimensions,
} from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS, SPACING, RADIUS } from '@constants/theme';
import {
  suggestionToDisplay,
  savedOutfitToDisplay,
  type DisplayOutfit,
  COLOR_HARMONY_LABELS,
} from '@types/outfit';
import type { OutfitSuggestion } from '@types/outfit';
import type { OutfitWithGarments, Garment } from '@types/database';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Props ────────────────────────────────────────────────────────────────────

interface BaseProps {
  variant?: 'full' | 'compact';
  onSave?: () => void;
  onSaveToCalendar?: () => void;
  onPress?: () => void;
  showSaveButton?: boolean;   // backward compat
  isSaving?: boolean;
  style?: object;
}

type OutfitCardProps = BaseProps & (
  | { suggestion: OutfitSuggestion; outfit?: never }
  | { outfit: OutfitWithGarments; suggestion?: never }
  | { suggestion: OutfitSuggestion; outfit: OutfitWithGarments } // should not happen, but TS requires it
);

// ─── Component ────────────────────────────────────────────────────────────────

export function OutfitCard({
  suggestion,
  outfit,
  variant = 'full',
  onSave,
  onSaveToCalendar,
  onPress,
  showSaveButton,
  isSaving = false,
  style,
}: OutfitCardProps) {
  const display: DisplayOutfit = suggestion
    ? suggestionToDisplay(suggestion)
    : savedOutfitToDisplay(outfit!);

  if (variant === 'compact') {
    return (
      <CompactCard display={display} onPress={onPress} style={style} />
    );
  }

  return (
    <FullCard
      display={display}
      onSave={onSave ?? (showSaveButton ? onSave : undefined)}
      onSaveToCalendar={onSaveToCalendar}
      onPress={onPress}
      isSaving={isSaving}
      style={style}
    />
  );
}

// ─── Full card ────────────────────────────────────────────────────────────────

function FullCard({
  display,
  onSave,
  onSaveToCalendar,
  onPress,
  isSaving,
  style,
}: {
  display: DisplayOutfit;
  onSave?: () => void;
  onSaveToCalendar?: () => void;
  onPress?: () => void;
  isSaving: boolean;
  style?: object;
}) {
  const adviceText = display.advice ?? '';
  const [displayedAdvice, setDisplayedAdvice] = useState('');
  const charRef = useRef(0);

  // Typewriter animation on advice text
  useEffect(() => {
    if (!adviceText) return;
    charRef.current = 0;
    setDisplayedAdvice('');

    const timer = setInterval(() => {
      charRef.current += 1;
      setDisplayedAdvice(adviceText.slice(0, charRef.current));
      if (charRef.current >= adviceText.length) clearInterval(timer);
    }, 16);

    return () => clearInterval(timer);
  }, [adviceText]);

  return (
    <Pressable
      style={[fullStyles.card, style]}
      onPress={onPress}
      disabled={!onPress}
    >
      {/* ── Garment collage ─────────────────────────────────────────────── */}
      <GarmentCollage garments={display.garments} />

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <View style={fullStyles.content}>
        {/* Header row */}
        <View style={fullStyles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={fullStyles.name} numberOfLines={1}>{display.name}</Text>
            {display.mood ? (
              <Text style={fullStyles.mood}>✦ {display.mood}</Text>
            ) : null}
          </View>

          {display.occasion_fit !== null && (
            <FitBadge score={display.occasion_fit} />
          )}
        </View>

        {/* Tags */}
        {display.tags.length > 0 && (
          <View style={fullStyles.tags}>
            {display.tags.map((tag) => (
              <View key={tag} style={fullStyles.tag}>
                <Text style={fullStyles.tagText}>#{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Advice (typewriter) */}
        {adviceText ? (
          <View style={fullStyles.adviceRow}>
            <Ionicons name="sparkles" size={13} color={COLORS.primary} />
            <Text style={fullStyles.adviceText}>{displayedAdvice}</Text>
          </View>
        ) : null}

        {/* Color harmony */}
        {display.color_harmony ? (
          <View style={fullStyles.harmonyRow}>
            <ColorHarmonyDots garments={display.garments} />
            <Text style={fullStyles.harmonyLabel}>
              {COLOR_HARMONY_LABELS[display.color_harmony as keyof typeof COLOR_HARMONY_LABELS]
                ?? display.color_harmony}
            </Text>
          </View>
        ) : null}

        {/* Action buttons */}
        {(onSave || onSaveToCalendar) && (
          <View style={fullStyles.actions}>
            {onSave && (
              <Pressable
                style={[fullStyles.actionBtn, fullStyles.actionBtnPrimary, isSaving && fullStyles.actionBtnDisabled]}
                onPress={onSave}
                disabled={isSaving}
              >
                <Ionicons
                  name={display.is_saved ? 'checkmark-circle' : 'bookmark-outline'}
                  size={16}
                  color="#fff"
                />
                <Text style={fullStyles.actionBtnText}>
                  {isSaving ? 'Guardando...' : display.is_saved ? 'Guardado' : 'Guardar look'}
                </Text>
              </Pressable>
            )}

            {onSaveToCalendar && (
              <Pressable
                style={[fullStyles.actionBtn, fullStyles.actionBtnSecondary]}
                onPress={onSaveToCalendar}
              >
                <Ionicons name="calendar-outline" size={16} color={COLORS.text} />
                <Text style={fullStyles.actionBtnTextSecondary}>Calendario</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </Pressable>
  );
}

// ─── Compact card ─────────────────────────────────────────────────────────────

function CompactCard({
  display,
  onPress,
  style,
}: {
  display: DisplayOutfit;
  onPress?: () => void;
  style?: object;
}) {
  const garments = display.garments.slice(0, 4);

  return (
    <Pressable
      style={[compactStyles.card, style]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={compactStyles.thumbsRow}>
        {garments.map((g) => (
          <GarmentThumb key={g.id} garment={g} size={52} />
        ))}
        {display.garments.length > 4 && (
          <View style={[compactStyles.overflowBadge]}>
            <Text style={compactStyles.overflowText}>+{display.garments.length - 4}</Text>
          </View>
        )}
      </View>
      <View style={compactStyles.info}>
        <Text style={compactStyles.name} numberOfLines={1}>{display.name}</Text>
        {display.tags.length > 0 && (
          <Text style={compactStyles.tags} numberOfLines={1}>
            {display.tags.map((t) => `#${t}`).join(' ')}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

// ─── Garment collage ──────────────────────────────────────────────────────────

const COLLAGE_HEIGHT = 240;
const GARMENT_TYPE_EMOJIS: Record<string, string> = {
  top: '👕', bottom: '👖', dress: '👗', outerwear: '🧥',
  shoes: '👟', bag: '👜', accessory: '💍', activewear: '🏃',
  swimwear: '👙', underwear: '🩱',
};

function GarmentThumb({
  garment,
  size = 80,
  borderRadius = RADIUS.sm,
}: {
  garment: Garment;
  size?: number;
  borderRadius?: number;
}) {
  const uri = garment.thumbnail_url ?? garment.processed_url ?? garment.original_url;
  const emoji = GARMENT_TYPE_EMOJIS[garment.type] ?? '👗';

  return uri ? (
    <Image
      source={{ uri }}
      style={{ width: size, height: size * (4 / 3), borderRadius }}
      contentFit="cover"
      recyclingKey={garment.id}
    />
  ) : (
    <View
      style={[
        { width: size, height: size * (4 / 3), borderRadius },
        collageStyles.placeholder,
        { backgroundColor: garment.primary_color + '44' },
      ]}
    >
      <Text style={{ fontSize: size * 0.4 }}>{emoji}</Text>
    </View>
  );
}

function GarmentCollage({ garments }: { garments: Garment[] }) {
  const count = Math.min(garments.length, 4);
  const shown = garments.slice(0, 4);

  if (count === 0) {
    return (
      <View style={[collageStyles.container, collageStyles.empty]}>
        <Text style={{ fontSize: 32 }}>👗</Text>
      </View>
    );
  }

  if (count === 1) {
    return (
      <View style={collageStyles.container}>
        <GarmentThumb garment={shown[0]} size={SCREEN_WIDTH - SPACING.md * 4} borderRadius={0} />
      </View>
    );
  }

  if (count === 2) {
    return (
      <View style={[collageStyles.container, collageStyles.row]}>
        {shown.map((g) => (
          <GarmentThumb key={g.id} garment={g} size={(SCREEN_WIDTH - SPACING.md * 4) / 2 - 1} borderRadius={0} />
        ))}
      </View>
    );
  }

  if (count === 3) {
    const halfW = (SCREEN_WIDTH - SPACING.md * 4) / 2 - 1;
    return (
      <View style={[collageStyles.container, collageStyles.row]}>
        {/* Left: tall image */}
        <GarmentThumb garment={shown[0]} size={halfW} borderRadius={0} />
        {/* Right: two stacked */}
        <View style={{ gap: 2 }}>
          <GarmentThumb garment={shown[1]} size={halfW} borderRadius={0} />
          <GarmentThumb garment={shown[2]} size={halfW} borderRadius={0} />
        </View>
      </View>
    );
  }

  // 4 items: 2x2 grid
  const quarterW = (SCREEN_WIDTH - SPACING.md * 4) / 2 - 1;
  return (
    <View style={collageStyles.container}>
      <View style={[collageStyles.row, { marginBottom: 2 }]}>
        <GarmentThumb garment={shown[0]} size={quarterW} borderRadius={0} />
        <GarmentThumb garment={shown[1]} size={quarterW} borderRadius={0} />
      </View>
      <View style={collageStyles.row}>
        <GarmentThumb garment={shown[2]} size={quarterW} borderRadius={0} />
        <GarmentThumb garment={shown[3]} size={quarterW} borderRadius={0} />
      </View>
    </View>
  );
}

const collageStyles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: COLORS.surfaceAlt,
  },
  row: { flexDirection: 'row', gap: 2 },
  empty: { height: COLLAGE_HEIGHT, justifyContent: 'center', alignItems: 'center' },
  placeholder: { justifyContent: 'center', alignItems: 'center' },
});

// ─── Occasion fit badge ───────────────────────────────────────────────────────

function FitBadge({ score }: { score: number }) {
  const color = score >= 80 ? COLORS.success : score >= 60 ? COLORS.warning : COLORS.error;
  return (
    <View style={[fitStyles.badge, { borderColor: color + '55' }]}>
      <Text style={[fitStyles.score, { color }]}>{score}</Text>
      <Text style={fitStyles.label}>%</Text>
    </View>
  );
}

const fitStyles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: SPACING.sm,
  },
  score: { fontSize: 16, fontWeight: '700' },
  label: { fontSize: 11, color: COLORS.textMuted, marginLeft: 1 },
});

// ─── Color harmony dots ───────────────────────────────────────────────────────

function ColorHarmonyDots({ garments }: { garments: Garment[] }) {
  const colors = [...new Set(garments.map((g) => g.primary_color))].slice(0, 4);
  return (
    <View style={harmonyStyles.dots}>
      {colors.map((c) => (
        <View key={c} style={[harmonyStyles.dot, { backgroundColor: c }]} />
      ))}
    </View>
  );
}

const harmonyStyles = StyleSheet.create({
  dots: { flexDirection: 'row', gap: 3, marginRight: SPACING.xs },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: COLORS.border },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const fullStyles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  content: { padding: SPACING.md, gap: SPACING.xs },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 2 },
  name: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  mood: { fontSize: 12, color: COLORS.accent, marginTop: 2 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  tag: {
    backgroundColor: COLORS.primary + '22',
    borderRadius: RADIUS.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.primary + '33',
  },
  tagText: { fontSize: 12, color: COLORS.primaryLight, fontWeight: '500' },
  adviceRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-start',
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
    marginTop: 2,
  },
  adviceText: { flex: 1, fontSize: 13, color: COLORS.textSecondary, lineHeight: 18 },
  harmonyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  harmonyLabel: { fontSize: 12, color: COLORS.textMuted },
  actions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: RADIUS.sm,
  },
  actionBtnPrimary: { backgroundColor: COLORS.primary },
  actionBtnSecondary: {
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  actionBtnDisabled: { opacity: 0.5 },
  actionBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  actionBtnTextSecondary: { fontSize: 13, fontWeight: '600', color: COLORS.text },
});

const compactStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.sm,
  },
  thumbsRow: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  overflowBadge: {
    width: 52,
    height: 52 * (4 / 3),
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overflowText: { fontSize: 13, color: COLORS.textMuted, fontWeight: '600' },
  info: { flex: 1 },
  name: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  tags: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
});
