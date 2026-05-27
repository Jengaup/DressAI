import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '@constants/theme';
import type { OutfitWithGarments } from '@types/database';

interface Props {
  outfit: OutfitWithGarments;
  showSaveButton?: boolean;
  onSave?: () => void;
  onPress?: () => void;
}

export function OutfitCard({ outfit, showSaveButton, onSave, onPress }: Props) {
  const garments = outfit.outfit_garments.map((og) => og.garment).filter(Boolean);

  return (
    <Pressable style={styles.card} onPress={onPress}>
      {/* Garment thumbnails row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbs}>
        {garments.map((g) => (
          <Image
            key={g.id}
            source={{ uri: g.thumbnail_url ?? g.processed_url ?? g.original_url }}
            style={styles.thumb}
            contentFit="cover"
            recyclingKey={g.id}
          />
        ))}
      </ScrollView>

      {/* Info */}
      <View style={styles.info}>
        <View style={styles.infoTop}>
          <View>
            <Text style={styles.title}>{outfit.name ?? `Look de ${outfit.occasion ?? 'diario'}`}</Text>
            {outfit.ai_reasoning && (
              <Text style={styles.reasoning} numberOfLines={2}>{outfit.ai_reasoning}</Text>
            )}
          </View>
          <View style={styles.badges}>
            {outfit.source === 'ai_generated' && (
              <View style={styles.aiBadge}>
                <Ionicons name="sparkles" size={10} color={COLORS.primary} />
                <Text style={styles.aiBadgeText}>IA</Text>
              </View>
            )}
          </View>
        </View>

        {showSaveButton && (
          <Pressable style={styles.saveBtn} onPress={onSave}>
            <Ionicons name="bookmark-outline" size={16} color={COLORS.primary} />
            <Text style={styles.saveBtnText}>Guardar look</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  thumbs: { padding: SPACING.sm },
  thumb: {
    width: 100,
    height: 120,
    borderRadius: RADIUS.sm,
    marginRight: SPACING.sm,
    backgroundColor: COLORS.surfaceAlt,
  },
  info: { padding: SPACING.md, gap: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border },
  infoTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  reasoning: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  badges: { gap: 4 },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: COLORS.primary + '22',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  aiBadgeText: { fontSize: 11, color: COLORS.primary, fontWeight: '600' },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  saveBtnText: { fontSize: 13, color: COLORS.primary, fontWeight: '600' },
});
