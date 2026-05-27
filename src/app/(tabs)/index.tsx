import { useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useWardrobeStore } from '@store/wardrobe.store';
import { GarmentCard } from '@components/garment/GarmentCard';
import { WardrobeFilters } from '@components/garment/WardrobeFilters';
import { COLORS, SPACING } from '@constants/theme';

export default function ClosetScreen() {
  const { fetchGarments, isLoading, getFilteredGarments } = useWardrobeStore();
  const garments = getFilteredGarments();

  useEffect(() => {
    fetchGarments();
  }, []);

  const handleAddPress = useCallback(() => {
    router.push('/(modals)/add-garment');
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Mi Clóset</Text>
        <View style={styles.headerRight}>
          <Text style={styles.garmentCount}>
            {garments.length} {garments.length === 1 ? 'prenda' : 'prendas'}
          </Text>
          <Pressable
            style={styles.addButton}
            onPress={handleAddPress}
            accessibilityLabel="Agregar prenda"
            accessibilityRole="button"
          >
            <Ionicons name="add" size={24} color={COLORS.background} />
          </Pressable>
        </View>
      </View>

      {/* Filters */}
      <WardrobeFilters />

      {/* Grid */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      ) : garments.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="shirt-outline" size={64} color={COLORS.textMuted} />
          <Text style={styles.emptyTitle}>Tu clóset está vacío</Text>
          <Text style={styles.emptySubtitle}>
            Toca el botón + para agregar tu primera prenda
          </Text>
        </View>
      ) : (
        <FlashList
          data={garments}
          numColumns={2}
          estimatedItemSize={220}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <GarmentCard
              garment={item}
              onPress={() => router.push(`/garment/${item.id}`)}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  title: { fontSize: 28, fontWeight: '700', color: COLORS.text },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  garmentCount: { fontSize: 14, color: COLORS.textMuted },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: { paddingHorizontal: SPACING.sm, paddingBottom: SPACING.xl },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: COLORS.text },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingHorizontal: SPACING.xl,
  },
});
