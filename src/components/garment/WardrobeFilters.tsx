import { ScrollView, Pressable, Text, StyleSheet, View } from 'react-native';
import { useWardrobeStore } from '@store/wardrobe.store';
import { GARMENT_TYPE_LABELS, COLORS, SPACING } from '@constants/theme';
import type { GarmentType } from '@types/database';

const TYPES = Object.keys(GARMENT_TYPE_LABELS) as GarmentType[];

export function WardrobeFilters() {
  const { filters, setFilter, clearFilters } = useWardrobeStore();
  const hasActiveFilter = filters.type !== null || filters.occasion !== null || filters.season !== null;

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {hasActiveFilter && (
          <Pressable style={styles.clearChip} onPress={clearFilters}>
            <Text style={styles.clearText}>✕ Limpiar</Text>
          </Pressable>
        )}

        {TYPES.map((t) => (
          <Pressable
            key={t}
            style={[styles.chip, filters.type === t && styles.chipActive]}
            onPress={() => setFilter('type', filters.type === t ? null : t)}
          >
            <Text style={[styles.chipText, filters.type === t && styles.chipTextActive]}>
              {GARMENT_TYPE_LABELS[t]}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: SPACING.sm },
  scroll: { paddingHorizontal: SPACING.md, gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 13, color: COLORS.textMuted },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  clearChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: COLORS.error + '22',
    borderWidth: 1,
    borderColor: COLORS.error + '44',
  },
  clearText: { fontSize: 13, color: COLORS.error, fontWeight: '600' },
});
