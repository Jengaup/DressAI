import { Pressable, View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { GARMENT_TYPE_LABELS, COLORS, SPACING, RADIUS } from '@constants/theme';
import type { Garment } from '@types/database';

interface Props {
  garment: Garment;
  onPress: () => void;
  onFavoritePress?: () => void;
  /** Explicit width; if omitted the card fills its container */
  width?: number;
  style?: ViewStyle;
}

export function GarmentCard({ garment, onPress, onFavoritePress, width, style }: Props) {
  return (
    <Pressable
      style={[styles.card, width !== undefined && { width }, style]}
      onPress={onPress}
    >
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: garment.thumbnail_url ?? garment.processed_url ?? garment.original_url }}
          style={styles.image}
          contentFit="cover"
          transition={150}
          recyclingKey={garment.id}
        />

        {/* Favorite badge */}
        {onFavoritePress && (
          <Pressable
            style={styles.favoriteBtn}
            onPress={(e) => {
              e.stopPropagation();
              onFavoritePress();
            }}
            hitSlop={8}
          >
            <Ionicons
              name={garment.is_favorite ? 'heart' : 'heart-outline'}
              size={15}
              color={garment.is_favorite ? '#E74C3C' : '#fff'}
            />
          </Pressable>
        )}

        {/* Times-worn badge (shown when > 0) */}
        {garment.times_worn > 0 && (
          <View style={styles.wornBadge}>
            <Text style={styles.wornText}>{garment.times_worn}×</Text>
          </View>
        )}
      </View>

      <View style={styles.meta}>
        <Text style={styles.name} numberOfLines={1}>
          {garment.name ?? GARMENT_TYPE_LABELS[garment.type]}
        </Text>
        <View style={styles.row}>
          <View style={[styles.colorDot, { backgroundColor: garment.primary_color }]} />
          <Text style={styles.colorLabel} numberOfLines={1}>{garment.color_label}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
  },
  imageContainer: { position: 'relative', width: '100%', aspectRatio: 3 / 4 },
  image: { width: '100%', height: '100%', backgroundColor: COLORS.surfaceAlt },
  favoriteBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  wornBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: RADIUS.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  wornText: { fontSize: 10, color: '#fff', fontWeight: '600' },
  meta: { padding: SPACING.xs + 2 },
  name: { fontSize: 11, fontWeight: '600', color: COLORS.text, marginBottom: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  colorDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  colorLabel: { fontSize: 10, color: COLORS.textMuted, flex: 1 },
});
