import {
  useRef, useCallback, useMemo, useEffect, useState,
} from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView,
  Dimensions, Animated, FlatList, type ListRenderItemInfo,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useOutfitGenerator } from '@hooks/useOutfitGenerator';
import { OutfitCard } from '@components/outfit/OutfitCard';
import { COLORS, SPACING, RADIUS, GARMENT_TYPE_LABELS } from '@constants/theme';
import type { GarmentSeason, GarmentType } from '@types/database';
import type { OutfitSuggestion } from '@types/outfit';
import { useGarments } from '@hooks/useGarments';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - SPACING.md * 2;

// ─── Filter config ────────────────────────────────────────────────────────────

const OCCASION_OPTIONS: Array<{ key: string; label: string; emoji: string }> = [
  { key: 'casual', label: 'Casual', emoji: '☀️' },
  { key: 'work', label: 'Trabajo', emoji: '💼' },
  { key: 'formal', label: 'Formal', emoji: '🎩' },
  { key: 'sport', label: 'Deporte', emoji: '🏃' },
  { key: 'date', label: 'Cita', emoji: '💑' },
  { key: 'party', label: 'Fiesta', emoji: '🎉' },
  { key: 'beach', label: 'Playa', emoji: '🏖️' },
];

const SEASON_OPTIONS: Array<{ key: GarmentSeason; label: string; emoji: string }> = [
  { key: 'spring', label: 'Primavera', emoji: '🌸' },
  { key: 'summer', label: 'Verano', emoji: '🌞' },
  { key: 'fall', label: 'Otoño', emoji: '🍂' },
  { key: 'winter', label: 'Invierno', emoji: '❄️' },
];

// ─── Generating skeleton ──────────────────────────────────────────────────────

function GeneratingSkeleton() {
  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ]),
    ).start();

    Animated.loop(
      Animated.timing(rotateAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
    ).start();

    return () => {
      pulseAnim.stopAnimation();
      rotateAnim.stopAnimation();
    };
  }, []);

  const spin = rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={skeletonStyles.container}>
      {/* Spinner */}
      <Animated.View style={[skeletonStyles.spinner, { transform: [{ rotate: spin }] }]}>
        <Ionicons name="sparkles" size={32} color={COLORS.primary} />
      </Animated.View>

      {/* Skeleton image grid */}
      <View style={skeletonStyles.grid}>
        {[0, 1, 2, 3].map((i) => (
          <Animated.View
            key={i}
            style={[
              skeletonStyles.cell,
              { opacity: Animated.add(pulseAnim, Animated.multiply(pulseAnim, i * 0.1)) },
            ]}
          />
        ))}
      </View>

      {/* Skeleton text lines */}
      <View style={skeletonStyles.textArea}>
        <Animated.View style={[skeletonStyles.line, skeletonStyles.lineWide, { opacity: pulseAnim }]} />
        <Animated.View style={[skeletonStyles.line, skeletonStyles.lineMedium, { opacity: pulseAnim }]} />
        <Animated.View style={[skeletonStyles.line, skeletonStyles.lineShort, { opacity: pulseAnim }]} />
      </View>

      <Text style={skeletonStyles.label}>Aria está analizando tu guardarropa...</Text>
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  container: {
    width: CARD_WIDTH,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    alignItems: 'center',
    paddingBottom: SPACING.lg,
  },
  spinner: {
    marginTop: SPACING.xl,
    marginBottom: SPACING.md,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: CARD_WIDTH,
    gap: 2,
    marginBottom: SPACING.md,
  },
  cell: {
    width: CARD_WIDTH / 2 - 1,
    height: 110,
    backgroundColor: COLORS.surfaceAlt,
  },
  textArea: { width: '85%', gap: SPACING.xs },
  line: { height: 12, borderRadius: RADIUS.sm, backgroundColor: COLORS.surfaceAlt },
  lineWide: { width: '90%' },
  lineMedium: { width: '65%' },
  lineShort: { width: '45%' },
  label: {
    marginTop: SPACING.md,
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
});

// ─── Idle state ───────────────────────────────────────────────────────────────

function IdleState({ onGenerate, wardrobeCount }: {
  onGenerate: () => void;
  wardrobeCount: number;
}) {
  const floatAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: -8, duration: 1400, useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ]),
    ).start();
    return () => floatAnim.stopAnimation();
  }, []);

  if (wardrobeCount < 2) {
    return (
      <View style={idleStyles.container}>
        <Text style={idleStyles.emoji}>👗</Text>
        <Text style={idleStyles.title}>Clóset vacío</Text>
        <Text style={idleStyles.subtitle}>
          Agrega al menos 2 prendas a tu clóset para que Aria pueda crear outfits para ti.
        </Text>
        <Pressable
          style={idleStyles.ctaSecondary}
          onPress={() => router.push('/(modals)/add-garment')}
        >
          <Ionicons name="add-circle-outline" size={18} color={COLORS.primary} />
          <Text style={idleStyles.ctaSecondaryText}>Agregar prenda</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={idleStyles.container}>
      <Animated.Text
        style={[idleStyles.emoji, { transform: [{ translateY: floatAnim }] }]}
      >
        ✨
      </Animated.Text>
      <Text style={idleStyles.title}>¿Lista para vestirte?</Text>
      <Text style={idleStyles.subtitle}>
        Aria analizará tus {wardrobeCount} prendas y creará looks perfectos según tus preferencias.
      </Text>
      <Pressable style={idleStyles.cta} onPress={onGenerate}>
        <Ionicons name="sparkles" size={20} color="#fff" />
        <Text style={idleStyles.ctaText}>Generar outfits</Text>
      </Pressable>
    </View>
  );
}

const idleStyles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: SPACING.xl, paddingHorizontal: SPACING.lg },
  emoji: { fontSize: 64, marginBottom: SPACING.md },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.sm },
  subtitle: {
    fontSize: 14, color: COLORS.textMuted, textAlign: 'center',
    lineHeight: 20, marginBottom: SPACING.lg,
  },
  cta: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.primary, paddingHorizontal: SPACING.xl,
    paddingVertical: 14, borderRadius: RADIUS.full,
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  ctaText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  ctaSecondary: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: COLORS.primary,
    paddingHorizontal: SPACING.lg, paddingVertical: 12, borderRadius: RADIUS.full,
  },
  ctaSecondaryText: { fontSize: 15, fontWeight: '600', color: COLORS.primary },
});

// ─── Pinned garment picker ────────────────────────────────────────────────────

function PinnedGarmentPicker({
  pinnedId,
  onSelect,
}: { pinnedId: string | null; onSelect: (id: string | null) => void }) {
  const { garments } = useGarments();
  const [expanded, setExpanded] = useState(false);

  const pinned = garments.find((g) => g.id === pinnedId);

  return (
    <View style={pinnedStyles.container}>
      <Pressable
        style={pinnedStyles.trigger}
        onPress={() => setExpanded((v) => !v)}
      >
        <Ionicons name="pin-outline" size={15} color={COLORS.textMuted} />
        <Text style={pinnedStyles.label}>
          {pinned ? `Incluir: ${pinned.name ?? GARMENT_TYPE_LABELS[pinned.type]}` : 'Incluir prenda específica'}
        </Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={COLORS.textMuted}
        />
      </Pressable>

      {expanded && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={pinnedStyles.scroll}
        >
          {/* Clear option */}
          {pinnedId && (
            <Pressable
              style={[pinnedStyles.garmentChip, pinnedStyles.clearChip]}
              onPress={() => { onSelect(null); setExpanded(false); }}
            >
              <Ionicons name="close" size={14} color={COLORS.error} />
              <Text style={pinnedStyles.clearText}>Quitar</Text>
            </Pressable>
          )}

          {garments.map((g) => {
            const uri = g.thumbnail_url ?? g.processed_url;
            const isSelected = g.id === pinnedId;
            return (
              <Pressable
                key={g.id}
                style={[pinnedStyles.garmentChip, isSelected && pinnedStyles.selectedChip]}
                onPress={() => { onSelect(isSelected ? null : g.id); setExpanded(false); }}
              >
                {uri ? (
                  <Image
                    source={{ uri }}
                    style={pinnedStyles.garmentThumb}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[pinnedStyles.garmentThumb, { backgroundColor: g.primary_color + '44' }]} />
                )}
                <Text style={[pinnedStyles.garmentLabel, isSelected && pinnedStyles.selectedLabel]} numberOfLines={1}>
                  {g.name ?? GARMENT_TYPE_LABELS[g.type]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const pinnedStyles = StyleSheet.create({
  container: { marginHorizontal: SPACING.md, marginBottom: SPACING.sm },
  trigger: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    backgroundColor: COLORS.surface, borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm, paddingVertical: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  label: { flex: 1, fontSize: 13, color: COLORS.textMuted },
  scroll: { marginTop: SPACING.xs },
  garmentChip: {
    alignItems: 'center', gap: 4,
    backgroundColor: COLORS.surface, borderRadius: RADIUS.sm,
    padding: SPACING.xs, marginRight: SPACING.xs,
    borderWidth: 1, borderColor: COLORS.border, width: 68,
  },
  selectedChip: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '18' },
  clearChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderColor: COLORS.error + '44', backgroundColor: COLORS.error + '11',
    width: 'auto', paddingHorizontal: 10,
  },
  garmentThumb: { width: 48, height: 64, borderRadius: RADIUS.xs },
  garmentLabel: { fontSize: 10, color: COLORS.textMuted, textAlign: 'center' },
  selectedLabel: { color: COLORS.primary, fontWeight: '600' },
  clearText: { fontSize: 12, color: COLORS.error, fontWeight: '600' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function GeneratorScreen() {
  const {
    status,
    suggestions,
    currentSuggestion,
    currentIndex,
    retryCountdown,
    isSaving,
    preferences,
    setPreferences,
    generate,
    saveCurrentSuggestion,
    saveSuggestion,
    goNext,
    goPrev,
    canGenerate,
    wardrobeCount,
    totalSuggestions,
  } = useOutfitGenerator();

  const flatListRef = useRef<FlatList<OutfitSuggestion>>(null);

  // Sync FlatList page when currentIndex changes (e.g. from prev/next buttons)
  const handleScroll = useCallback(
    (event: { nativeEvent: { contentOffset: { x: number } } }) => {
      const x = event.nativeEvent.contentOffset.x;
      const newIndex = Math.round(x / CARD_WIDTH);
      if (newIndex !== currentIndex) {
        // Don't call goNext/goPrev here to avoid feedback loop
        // currentIndex is a derived value from the FlatList position
      }
    },
    [currentIndex],
  );

  const renderSuggestion = useCallback(
    ({ item, index }: ListRenderItemInfo<OutfitSuggestion>) => (
      <View style={{ width: CARD_WIDTH, paddingHorizontal: 0 }}>
        <OutfitCard
          suggestion={item}
          variant="full"
          onSave={() => saveSuggestion(item)}
          onSaveToCalendar={() => {
            saveSuggestion(item).then((saved) => {
              if (saved) router.push(`/outfit/${saved.id}`);
            }).catch(() => {});
          }}
          isSaving={isSaving}
        />
      </View>
    ),
    [saveSuggestion, isSaving],
  );

  const isGenerating = status === 'generating';
  const isSuccess = status === 'success';
  const isIdle = status === 'idle' || status === 'error';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[0]}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* ── Sticky header ─────────────────────────────────────────────── */}
        <View style={styles.stickyHeader}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>Generar Outfit</Text>
              <Text style={styles.subtitle}>
                Aria, tu estilista personal con IA
              </Text>
            </View>
            {isSuccess && (
              <Pressable
                style={[styles.regenerateBtn, !canGenerate && styles.regenerateBtnDisabled]}
                onPress={generate}
                disabled={!canGenerate}
              >
                <Ionicons name="refresh" size={16} color={canGenerate ? COLORS.primary : COLORS.textMuted} />
                <Text style={[styles.regenerateBtnText, !canGenerate && { color: COLORS.textMuted }]}>
                  {retryCountdown > 0 ? `${retryCountdown}s` : 'Nuevos'}
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* ── Filters ───────────────────────────────────────────────────── */}
        <View style={styles.filtersSection}>
          {/* Occasion */}
          <Text style={styles.filterLabel}>Ocasión</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
            {OCCASION_OPTIONS.map((opt) => {
              const active = preferences.occasion === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() =>
                    setPreferences((p) => ({ ...p, occasion: active ? null : opt.key }))
                  }
                >
                  <Text style={styles.filterEmoji}>{opt.emoji}</Text>
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Season */}
          <Text style={[styles.filterLabel, { marginTop: SPACING.sm }]}>Temporada</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
            {SEASON_OPTIONS.map((opt) => {
              const active = preferences.season === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() =>
                    setPreferences((p) => ({
                      ...p,
                      season: active ? null : opt.key,
                    }))
                  }
                >
                  <Text style={styles.filterEmoji}>{opt.emoji}</Text>
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Pinned garment picker */}
          {wardrobeCount > 0 && (
            <View style={{ marginTop: SPACING.sm }}>
              <PinnedGarmentPicker
                pinnedId={preferences.pinnedGarmentId}
                onSelect={(id) => setPreferences((p) => ({ ...p, pinnedGarmentId: id }))}
              />
            </View>
          )}
        </View>

        {/* ── Main content area ─────────────────────────────────────────── */}
        <View style={styles.mainArea}>
          {isIdle && (
            <IdleState onGenerate={generate} wardrobeCount={wardrobeCount} />
          )}

          {isGenerating && (
            <View style={{ paddingHorizontal: SPACING.md }}>
              <GeneratingSkeleton />
            </View>
          )}

          {isSuccess && suggestions.length > 0 && (
            <>
              {/* Paginated horizontal list */}
              <FlatList
                ref={flatListRef}
                data={suggestions}
                renderItem={renderSuggestion}
                keyExtractor={(item) => item.id}
                horizontal
                pagingEnabled
                snapToInterval={CARD_WIDTH}
                snapToAlignment="start"
                decelerationRate="fast"
                showsHorizontalScrollIndicator={false}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                contentContainerStyle={{ paddingHorizontal: SPACING.md, gap: 0 }}
                style={{ overflow: 'visible' }}
                // Prevent nested scroll conflict
                nestedScrollEnabled
                scrollEnabled
              />

              {/* Page indicator + prev/next */}
              {totalSuggestions > 1 && (
                <View style={styles.pagination}>
                  <Pressable
                    style={[styles.pageBtn, currentIndex === 0 && styles.pageBtnDisabled]}
                    onPress={goPrev}
                    disabled={currentIndex === 0}
                  >
                    <Ionicons name="chevron-back" size={18} color={currentIndex === 0 ? COLORS.textMuted : COLORS.text} />
                  </Pressable>

                  <View style={styles.dots}>
                    {suggestions.map((_, i) => (
                      <View
                        key={i}
                        style={[styles.dot, i === currentIndex && styles.dotActive]}
                      />
                    ))}
                  </View>

                  <Pressable
                    style={[styles.pageBtn, currentIndex === totalSuggestions - 1 && styles.pageBtnDisabled]}
                    onPress={goNext}
                    disabled={currentIndex === totalSuggestions - 1}
                  >
                    <Ionicons name="chevron-forward" size={18} color={currentIndex === totalSuggestions - 1 ? COLORS.textMuted : COLORS.text} />
                  </Pressable>
                </View>
              )}
            </>
          )}
        </View>

        {/* ── Generate CTA ──────────────────────────────────────────────── */}
        {(isIdle || isSuccess) && wardrobeCount >= 2 && (
          <Pressable
            style={[
              styles.generateBtn,
              (!canGenerate || isGenerating) && styles.generateBtnDisabled,
            ]}
            onPress={generate}
            disabled={!canGenerate || isGenerating}
          >
            <Ionicons name="sparkles" size={20} color="#fff" />
            <Text style={styles.generateBtnText}>
              {retryCountdown > 0
                ? `Disponible en ${retryCountdown}s`
                : isSuccess
                  ? 'Generar 3 looks nuevos'
                  : 'Generar 3 looks'}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  stickyHeader: {
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  title: { fontSize: 26, fontWeight: '700', color: COLORS.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  regenerateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: COLORS.primary + '55',
    borderRadius: RADIUS.full,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  regenerateBtnDisabled: { borderColor: COLORS.border },
  regenerateBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.primary },

  filtersSection: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  filterLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: SPACING.xs },
  filterScroll: { marginHorizontal: -SPACING.md },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.surface, marginLeft: SPACING.md, marginRight: 4,
  },
  filterChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterEmoji: { fontSize: 14 },
  filterChipText: { fontSize: 13, color: COLORS.textMuted },
  filterChipTextActive: { color: '#fff', fontWeight: '600' },

  mainArea: { paddingVertical: SPACING.md },

  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.md,
    marginTop: SPACING.md,
  },
  pageBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    justifyContent: 'center', alignItems: 'center',
  },
  pageBtnDisabled: { opacity: 0.4 },
  dots: { flexDirection: 'row', gap: 6 },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: COLORS.border,
  },
  dotActive: { backgroundColor: COLORS.primary, width: 20 },

  generateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.primary,
    marginHorizontal: SPACING.md,
    paddingVertical: 16, borderRadius: RADIUS.md,
    marginTop: SPACING.md,
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 8, elevation: 6,
  },
  generateBtnDisabled: { opacity: 0.5, shadowOpacity: 0 },
  generateBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
