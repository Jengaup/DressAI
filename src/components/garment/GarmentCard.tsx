import { Pressable, View, Text, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useWardrobeStore } from '@store/wardrobe.store';
import { GARMENT_TYPE_LABELS, COLORS, SPACING, RADIUS } from '@constants/theme';
import type { Garment } from '@types/database';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - SPACING.sm * 3) / 2;

interface Props {
  garment: Garment;
  onPress: () => void;
}

export function GarmentCard({ garment, onPress }: Props) {
  const { toggleFavorite } = useWardrobeStore();

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: garment.thumbnail_url ?? garment.processed_url ?? garment.original_url }}
          style={styles.image}
          contentFit="cover"
          transition={150}
          recyclingKey={garment.id}
        />
        <Pressable
          style={styles.favoriteBtn}
          onPress={(e) => {
            e.stopPropagation();
            toggleFavorite(garment.id);
          }}
          hitSlop={8}
        >
          <Ionicons
            name={garment.is_favorite ? 'heart' : 'heart-outline'}
            size={18}
            color={garment.is_favorite ? '#E74C3C' : '#fff'}
          />
        </Pressable>
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
    width: CARD_WIDTH,
    margin: SPACING.xs,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
  },
  imageContainer: { position: 'relative', width: '100%', aspectRatio: 3 / 4 },
  image: { width: '100%', height: '100%', backgroundColor: COLORS.surfaceAlt },
  favoriteBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  meta: { padding: SPACING.sm },
  name: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  colorDot: { width: 12, height: 12, borderRadius: 6 },
  colorLabel: { fontSize: 11, color: COLORS.textMuted, flex: 1 },
});
