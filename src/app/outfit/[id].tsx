import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useOutfitStore } from '@store/outfit.store';
import { GARMENT_TYPE_LABELS, COLORS, SPACING, RADIUS } from '@constants/theme';

export default function OutfitDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getById, toggleFavorite } = useOutfitStore();

  const outfit = getById(id);

  if (!outfit) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={{ color: COLORS.textMuted, textAlign: 'center', marginTop: 40 }}>
          Look no encontrado
        </Text>
      </SafeAreaView>
    );
  }

  const garments = outfit.outfit_garments.map((og) => og.garment).filter(Boolean);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {outfit.name ?? 'Detalle del look'}
        </Text>
        <Pressable onPress={() => toggleFavorite(outfit.id)}>
          <Ionicons
            name={outfit.is_favorite ? 'heart' : 'heart-outline'}
            size={24}
            color={outfit.is_favorite ? '#E74C3C' : COLORS.text}
          />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Garments grid */}
        <View style={styles.grid}>
          {garments.map((g) => (
            <Pressable
              key={g.id}
              style={styles.garmentItem}
              onPress={() => router.push(`/garment/${g.id}`)}
            >
              <Image
                source={{ uri: g.processed_url ?? g.original_url }}
                style={styles.garmentImage}
                contentFit="contain"
                transition={150}
              />
              <Text style={styles.garmentLabel} numberOfLines={1}>
                {g.name ?? GARMENT_TYPE_LABELS[g.type]}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Meta */}
        <View style={styles.meta}>
          {outfit.ai_reasoning && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Nota del estilista IA</Text>
              <Text style={styles.reasoning}>{outfit.ai_reasoning}</Text>
            </View>
          )}
          <View style={styles.statsRow}>
            <StatItem icon="repeat-outline" label={`${outfit.times_worn} veces usado`} />
            {outfit.occasion && <StatItem icon="tag-outline" label={outfit.occasion} />}
            {outfit.season && <StatItem icon="partly-sunny-outline" label={outfit.season} />}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatItem({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={statStyles.item}>
      <Ionicons name={icon as any} size={15} color={COLORS.textMuted} />
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontSize: 13, color: COLORS.textMuted },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  title: { fontSize: 17, fontWeight: '600', color: COLORS.text, flex: 1, textAlign: 'center', marginHorizontal: SPACING.sm },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: SPACING.sm,
    gap: SPACING.sm,
  },
  garmentItem: {
    width: '46%',
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
  },
  garmentImage: { width: '100%', aspectRatio: 3 / 4 },
  garmentLabel: { fontSize: 12, color: COLORS.textMuted, padding: 8 },
  meta: { padding: SPACING.md, gap: SPACING.md },
  section: { gap: 6 },
  sectionLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  reasoning: { fontSize: 14, color: COLORS.text, lineHeight: 20 },
  statsRow: { flexDirection: 'row', gap: SPACING.md, flexWrap: 'wrap' },
});
