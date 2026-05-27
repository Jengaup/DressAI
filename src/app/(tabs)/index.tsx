import {
  useState, useCallback, useRef, useMemo,
} from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput,
  RefreshControl, Animated, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useGarments, useWardrobeStats, useToggleFavorite } from '@hooks/useGarments';
import { useWardrobeStore } from '@store/wardrobe.store';
import { GarmentCard } from '@components/garment/GarmentCard';
import { COLORS, SPACING, RADIUS, GARMENT_TYPE_LABELS } from '@constants/theme';
import type { GarmentType, GarmentSeason } from '@types/database';
import type { GarmentFilter, GarmentSortField } from '@types/garment';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NUM_COLS = 3;
const CARD_WIDTH = (SCREEN_WIDTH - SPACING.md * 2 - SPACING.xs * (NUM_COLS - 1)) / NUM_COLS;

// Category chips: "Todos" + each garment type
const FILTER_CHIPS: Array<{ key: GarmentType | 'all'; label: string; icon: string }> = [
  { key: 'all', label: 'Todos', icon: 'grid-outline' },
  { key: 'top', label: 'Tops', icon: 'shirt-outline' },
  { key: 'bottom', label: 'Pantalones', icon: 'body-outline' },
  { key: 'dress', label: 'Vestidos', icon: 'rose-outline' },
  { key: 'outerwear', label: 'Abrigos', icon: 'cloud-outline' },
  { key: 'shoes', label: 'Zapatos', icon: 'footsteps-outline' },
  { key: 'bag', label: 'Bolsos', icon: 'bag-outline' },
  { key: 'accessory', label: 'Accesorios', icon: 'sparkles-outline' },
  { key: 'activewear', label: 'Deporte', icon: 'bicycle-outline' },
];

const SORT_OPTIONS: Array<{ key: GarmentSortField; label: string }> = [
  { key: 'newest', label: 'Más nuevo' },
  { key: 'most_worn', label: 'Más usado' },
  { key: 'recently_worn', label: 'Usado recientemente' },
  { key: 'name', label: 'Nombre A-Z' },
];

export default function ClosetScreen() {
  const [filter, setFilter] = useState<GarmentFilter>({
    sortBy: 'newest',
    favoritesOnly: false,
  });
  const [searchText, setSearchText] = useState('');
  const [showSortMenu, setShowSortMenu] = useState(false);

  // Debounce search so we don't fire on every keystroke
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = useCallback((text: string) => {
    setSearchText(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setFilter((prev) => ({ ...prev, searchQuery: text || undefined }));
    }, 300);
  }, []);

  const activeFilter = useMemo<GarmentFilter>(() => ({
    ...filter,
    searchQuery: searchText || undefined,
  }), [filter, searchText]);

  const { garments, isLoading, refetch, isFetching } = useGarments(activeFilter);
  const stats = useWardrobeStats();
  const { mutate: toggleFavorite } = useToggleFavorite();

  // FAB pulse animation
  const fabScale = useRef(new Animated.Value(1)).current;
  const handleFabPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.sequence([
      Animated.timing(fabScale, { toValue: 0.88, duration: 80, useNativeDriver: true }),
      Animated.spring(fabScale, { toValue: 1, useNativeDriver: true }),
    ]).start();
    router.push('/(modals)/add-garment');
  }, [fabScale]);

  const setTypeFilter = useCallback((key: GarmentType | 'all') => {
    setFilter((prev) => ({ ...prev, type: key === 'all' ? null : key }));
  }, []);

  const activeType = filter.type ?? 'all';

  const renderItem = useCallback(
    ({ item, index }: { item: (typeof garments)[0]; index: number }) => {
      const col = index % NUM_COLS;
      return (
        <GarmentCard
          garment={item}
          width={CARD_WIDTH}
          style={{
            marginLeft: col === 0 ? SPACING.md : SPACING.xs / 2,
            marginRight: col === NUM_COLS - 1 ? SPACING.md : SPACING.xs / 2,
            marginBottom: SPACING.sm,
          }}
          onPress={() => router.push(`/garment/${item.id}`)}
          onFavoritePress={() => toggleFavorite(item.id)}
        />
      );
    },
    [toggleFavorite],
  );

  const ListHeader = useMemo(() => (
    <View>
      {/* Stats bar */}
      <View style={styles.statsBar}>
        <StatPill
          icon="shirt-outline"
          label={`${stats.total} prendas`}
          color={COLORS.primary}
        />
        <StatPill
          icon="heart"
          label={`${stats.favorites} favoritas`}
          color="#E74C3C"
        />
        {stats.addedThisMonth > 0 && (
          <StatPill
            icon="add-circle-outline"
            label={`+${stats.addedThisMonth} este mes`}
            color={COLORS.success}
          />
        )}
      </View>

      {/* Search bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por nombre, marca, color..."
            placeholderTextColor={COLORS.textMuted}
            value={searchText}
            onChangeText={handleSearchChange}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searchText.length > 0 && (
            <Pressable onPress={() => handleSearchChange('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
            </Pressable>
          )}
        </View>

        {/* Sort button */}
        <Pressable
          style={styles.sortBtn}
          onPress={() => setShowSortMenu((v) => !v)}
        >
          <Ionicons
            name="funnel-outline"
            size={18}
            color={showSortMenu ? COLORS.primary : COLORS.text}
          />
        </Pressable>

        {/* Favorites toggle */}
        <Pressable
          style={[styles.favBtn, filter.favoritesOnly && styles.favBtnActive]}
          onPress={() =>
            setFilter((prev) => ({ ...prev, favoritesOnly: !prev.favoritesOnly }))
          }
        >
          <Ionicons
            name={filter.favoritesOnly ? 'heart' : 'heart-outline'}
            size={18}
            color={filter.favoritesOnly ? '#E74C3C' : COLORS.text}
          />
        </Pressable>
      </View>

      {/* Sort menu */}
      {showSortMenu && (
        <View style={styles.sortMenu}>
          {SORT_OPTIONS.map((opt) => (
            <Pressable
              key={opt.key}
              style={[styles.sortOption, filter.sortBy === opt.key && styles.sortOptionActive]}
              onPress={() => {
                setFilter((prev) => ({ ...prev, sortBy: opt.key }));
                setShowSortMenu(false);
              }}
            >
              <Text style={[
                styles.sortOptionText,
                filter.sortBy === opt.key && styles.sortOptionTextActive,
              ]}>
                {opt.label}
              </Text>
              {filter.sortBy === opt.key && (
                <Ionicons name="checkmark" size={14} color={COLORS.primary} />
              )}
            </Pressable>
          ))}
        </View>
      )}

      {/* Category chips */}
      <FlashList
        data={FILTER_CHIPS}
        horizontal
        estimatedItemSize={90}
        keyExtractor={(c) => c.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsContent}
        renderItem={({ item: chip }) => (
          <Pressable
            style={[styles.chip, activeType === chip.key && styles.chipActive]}
            onPress={() => setTypeFilter(chip.key)}
          >
            <Ionicons
              name={chip.icon as any}
              size={14}
              color={activeType === chip.key ? '#fff' : COLORS.textMuted}
            />
            <Text style={[styles.chipText, activeType === chip.key && styles.chipTextActive]}>
              {chip.label}
            </Text>
          </Pressable>
        )}
      />
    </View>
  ), [
    stats, searchText, handleSearchChange,
    showSortMenu, filter.favoritesOnly, filter.sortBy, activeType,
    setTypeFilter,
  ]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Mi Clóset</Text>
          {garments.length > 0 && (
            <Text style={styles.subtitle}>
              {garments.length} {garments.length === 1 ? 'prenda' : 'prendas'}
              {activeType !== 'all' && ` · ${GARMENT_TYPE_LABELS[activeType as GarmentType]}`}
            </Text>
          )}
        </View>
      </View>

      {/* Main list */}
      <FlashList
        data={garments}
        numColumns={NUM_COLS}
        estimatedItemSize={CARD_WIDTH * (4 / 3) + 48}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>
                {activeType === 'all' ? '👗' : '🔍'}
              </Text>
              <Text style={styles.emptyTitle}>
                {activeType === 'all' && !searchText
                  ? 'Tu clóset está vacío'
                  : 'Sin resultados'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {activeType === 'all' && !searchText
                  ? 'Toca el botón + para agregar tu primera prenda'
                  : 'Prueba con otros filtros o términos de búsqueda'}
              </Text>
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={refetch}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />

      {/* FAB */}
      <Animated.View
        style={[styles.fab, { transform: [{ scale: fabScale }] }]}
        pointerEvents="box-none"
      >
        <Pressable
          style={styles.fabInner}
          onPress={handleFabPress}
          accessibilityLabel="Agregar prenda"
          accessibilityRole="button"
        >
          <Ionicons name="add" size={28} color="#fff" />
        </Pressable>
      </Animated.View>
    </SafeAreaView>
  );
}

// ─── Sub-component ────────────────────────────────────────────────────────────

function StatPill({ icon, label, color }: { icon: string; label: string; color: string }) {
  return (
    <View style={statStyles.pill}>
      <Ionicons name={icon as any} size={13} color={color} />
      <Text style={statStyles.text}>{label}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  text: { fontSize: 12, color: COLORS.textSecondary },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  header: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.sm,
  },
  title: { fontSize: 28, fontWeight: '700', color: COLORS.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },

  statsBar: {
    flexDirection: 'row',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
    flexWrap: 'wrap',
  },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    padding: 0,
  },
  sortBtn: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  favBtn: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  favBtnActive: {
    backgroundColor: '#E74C3C22',
    borderColor: '#E74C3C44',
  },

  sortMenu: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  sortOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sortOptionActive: { backgroundColor: COLORS.primary + '18' },
  sortOptionText: { fontSize: 14, color: COLORS.text },
  sortOptionTextActive: { color: COLORS.primary, fontWeight: '600' },

  chipsContent: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
  },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    marginRight: SPACING.xs,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: { fontSize: 13, color: COLORS.textMuted },
  chipTextActive: { color: '#fff', fontWeight: '600' },

  listContent: { paddingBottom: 100 }, // space for FAB

  emptyState: {
    alignItems: 'center',
    paddingTop: SPACING.xl * 2,
    paddingHorizontal: SPACING.xl,
    gap: SPACING.sm,
  },
  emptyIcon: { fontSize: 56 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: COLORS.text, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20 },

  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
  },
  fabInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
});
