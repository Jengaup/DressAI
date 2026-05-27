import { useState, useRef, useCallback, useEffect, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
  Dimensions,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Calendar, type DateData } from 'react-native-calendars';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import ViewShot from 'react-native-view-shot';
import Toast from 'react-native-toast-message';
import { useGarments } from '@hooks/useGarments';
import { usePlanner, SLOT_META, typeToSlot, type SlotKey } from '@hooks/usePlanner';
import { usePlannerStore } from '@store/planner.store';
import { COLORS, SPACING, RADIUS } from '@constants/theme';
import type { Garment } from '@types/database';

const { width: SW } = Dimensions.get('window');

const SLOT_W = (SW - SPACING.md * 2 - SPACING.sm) / 2;
const SLOT_H = Math.round(SLOT_W * 0.72);
const GARMENT_THUMB = 56;
const GRID_COLS = 4;
const GRID_ITEM = Math.floor((SW - SPACING.md * 2 - SPACING.xs * (GRID_COLS - 1)) / GRID_COLS);

interface ItemLayout {
  x: number; y: number; width: number; height: number;
}

// ─── SlotCard ─────────────────────────────────────────────────────────────────

interface SlotCardProps {
  slotKey: SlotKey;
  garment: Garment | null;
  onRemove: (slot: SlotKey) => void;
  highlighted: boolean;
}

const SlotCard = memo(function SlotCard({ slotKey, garment, onRemove, highlighted }: SlotCardProps) {
  const meta = SLOT_META[slotKey];
  const scale = useSharedValue(1);

  // Bounce animation whenever a garment lands
  useEffect(() => {
    if (garment) {
      scale.value = withSpring(1.05, { damping: 8 }, () => {
        scale.value = withSpring(1, { damping: 14 });
      });
    }
  }, [garment?.id]);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      style={[
        styles.slotCard,
        { borderColor: highlighted ? COLORS.primaryLight : garment ? COLORS.accent : COLORS.border },
        animStyle,
      ]}
    >
      {garment ? (
        <>
          <Image
            source={{ uri: garment.thumbnail_url ?? garment.processed_url ?? garment.original_url }}
            style={styles.slotImage}
            contentFit="cover"
          />
          <View style={styles.slotNameBar}>
            <Text style={styles.slotGarmentName} numberOfLines={1}>
              {garment.name ?? garment.type}
            </Text>
          </View>
          <Pressable style={styles.slotRemove} onPress={() => onRemove(slotKey)} hitSlop={10}>
            <Ionicons name="close-circle" size={22} color={COLORS.error} />
          </Pressable>
        </>
      ) : (
        <View style={styles.slotEmpty}>
          <Ionicons name={meta.icon as any} size={28} color={COLORS.border} />
          <Text style={styles.slotLabel}>{meta.label}</Text>
          <Text style={styles.slotHint}>{meta.hint}</Text>
        </View>
      )}
    </Animated.View>
  );
});

// ─── GarmentGridItem ──────────────────────────────────────────────────────────

interface GarmentGridItemProps {
  garment: Garment;
  isInSlot: boolean;
  onPress: (garment: Garment, layout: ItemLayout) => void;
}

const GarmentGridItem = memo(function GarmentGridItem({ garment, isInSlot, onPress }: GarmentGridItemProps) {
  const viewRef = useRef<View>(null);

  const handlePress = useCallback(() => {
    viewRef.current?.measureInWindow((x, y, w, h) => {
      onPress(garment, { x, y, width: w, height: h });
    });
  }, [garment, onPress]);

  return (
    <Pressable onPress={handlePress} style={styles.gridItem}>
      <View ref={viewRef} style={styles.gridThumb} collapsable={false}>
        <Image
          source={{ uri: garment.thumbnail_url ?? garment.processed_url ?? garment.original_url }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
        {isInSlot && (
          <View style={styles.gridInSlotOverlay}>
            <Ionicons name="checkmark-circle" size={22} color={COLORS.accent} />
          </View>
        )}
        {garment.is_favorite && !isInSlot && (
          <View style={styles.gridFavBadge}>
            <Ionicons name="heart" size={9} color={COLORS.primary} />
          </View>
        )}
      </View>
      <Text style={styles.gridItemName} numberOfLines={1}>
        {garment.name ?? garment.type}
      </Text>
    </Pressable>
  );
});

// ─── DatePickerModal ──────────────────────────────────────────────────────────

interface DatePickerModalProps {
  visible: boolean;
  preselectedDate: string | null;
  isSaving: boolean;
  onConfirm: (date: string) => void;
  onClose: () => void;
}

function DatePickerModal({ visible, preselectedDate, isSaving, onConfirm, onClose }: DatePickerModalProps) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [picked, setPicked] = useState(preselectedDate ?? today);

  useEffect(() => {
    if (visible) setPicked(preselectedDate ?? today);
  }, [visible, preselectedDate, today]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>¿Para qué día es este look?</Text>

          <Calendar
            current={picked}
            minDate={today}
            markedDates={{ [picked]: { selected: true, selectedColor: COLORS.primary } }}
            onDayPress={(d: DateData) => setPicked(d.dateString)}
            theme={{
              backgroundColor: COLORS.surface,
              calendarBackground: COLORS.surface,
              textSectionTitleColor: COLORS.textMuted,
              selectedDayBackgroundColor: COLORS.primary,
              selectedDayTextColor: '#fff',
              todayTextColor: COLORS.primaryLight,
              dayTextColor: COLORS.text,
              arrowColor: COLORS.primary,
              monthTextColor: COLORS.text,
              textMonthFontWeight: '700',
              textDayFontWeight: '400',
              textDayHeaderFontWeight: '500',
            }}
          />

          <View style={styles.modalActions}>
            <Pressable style={styles.modalCancel} onPress={onClose}>
              <Text style={styles.modalCancelText}>Cancelar</Text>
            </Pressable>
            <Pressable
              style={[styles.modalConfirm, isSaving && { opacity: 0.6 }]}
              onPress={() => !isSaving && onConfirm(picked)}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.modalConfirmText}>
                  Guardar — {format(new Date(picked + 'T12:00:00'), "d 'de' MMM", { locale: es })}
                </Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── PlannerScreen ────────────────────────────────────────────────────────────

export default function PlannerScreen() {
  const { garments } = useGarments();
  const { pendingDate, setPendingDate } = usePlannerStore();
  const { slots, assignGarment, removeFromSlot, clearAll, saveToCalendar, filledCount, canSave, isSaving, garmentSlotMap } = usePlanner();

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [prefilledDate, setPrefilledDate] = useState<string | null>(null);
  const [highlightedSlot, setHighlightedSlot] = useState<SlotKey | null>(null);
  const [flyingGarment, setFlyingGarment] = useState<Garment | null>(null);

  // Flying animation shared values
  const flyX = useSharedValue(0);
  const flyY = useSharedValue(0);
  const flyScale = useSharedValue(1);
  const flyOpacity = useSharedValue(0);

  // Slot measurement refs — absolute views overlaid on each slot wrapper
  const slotRefs = useRef<Record<SlotKey, View | null>>({ top: null, bottom: null, shoes: null, accessory: null });

  // ViewShot ref for flat-lay sharing
  const viewShotRef = useRef<{ capture: () => Promise<string> }>(null);

  // Consume pending navigation date from CalendarScreen
  useEffect(() => {
    if (pendingDate) {
      setPrefilledDate(pendingDate);
      setShowDatePicker(true);
      setPendingDate(null);
    }
  }, [pendingDate, setPendingDate]);

  // ── Flying animation ─────────────────────────────────────────────────────

  const flyStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    top: 0,
    left: 0,
    width: GARMENT_THUMB,
    height: GARMENT_THUMB,
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
    zIndex: 9999,
    transform: [
      { translateX: flyX.value },
      { translateY: flyY.value },
      { scale: flyScale.value },
    ],
    opacity: flyOpacity.value,
  }));

  const onFlyComplete = useCallback(
    (garment: Garment) => {
      setFlyingGarment(null);
      setHighlightedSlot(null);
      assignGarment(garment);
    },
    [assignGarment],
  );

  const handleGarmentPress = useCallback(
    (garment: Garment, src: ItemLayout) => {
      const slot = typeToSlot(garment.type);
      const slotView = slotRefs.current[slot];

      // Fallback: no measurement possible — assign immediately
      if (!slotView) { assignGarment(garment); return; }

      slotView.measureInWindow((tx, ty, tw, th) => {
        const fromX = src.x + (src.width - GARMENT_THUMB) / 2;
        const fromY = src.y + (src.height - GARMENT_THUMB) / 2;
        const toX   = tx + (tw - GARMENT_THUMB) / 2;
        const toY   = ty + (th - GARMENT_THUMB) / 2;

        setFlyingGarment(garment);
        setHighlightedSlot(slot);
        flyX.value     = fromX;
        flyY.value     = fromY;
        flyScale.value = 1;
        flyOpacity.value = 0.92;

        const spring = { damping: 16, stiffness: 230 };
        flyX.value     = withSpring(toX, spring);
        flyY.value     = withSpring(toY, spring);
        flyScale.value = withSpring(0.5, { damping: 14 });
        flyOpacity.value = withTiming(0, { duration: 460 }, (done) => {
          if (done) runOnJS(onFlyComplete)(garment);
        });
      });
    },
    [assignGarment, onFlyComplete, flyX, flyY, flyScale, flyOpacity],
  );

  // ── Share ────────────────────────────────────────────────────────────────

  const handleShare = useCallback(async () => {
    if (filledCount === 0) {
      Toast.show({ type: 'error', text1: 'Agrega prendas al look primero' });
      return;
    }
    try {
      const uri = await viewShotRef.current?.capture();
      if (uri && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Compartir look' });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch {
      Toast.show({ type: 'error', text1: 'No se pudo compartir la imagen' });
    }
  }, [filledCount]);

  // ── Save to calendar ─────────────────────────────────────────────────────

  const handleConfirmDate = useCallback(
    async (date: string) => {
      const ok = await saveToCalendar(date);
      if (ok) setShowDatePicker(false);
    },
    [saveToCalendar],
  );

  const activeGarments = garments.filter((g) => g.is_active);

  // ── Slot wrapper helper ──────────────────────────────────────────────────

  function slotWrapper(slotKey: SlotKey) {
    return (
      <View style={styles.slotWrapper}>
        <SlotCard
          slotKey={slotKey}
          garment={slots[slotKey]}
          onRemove={removeFromSlot}
          highlighted={highlightedSlot === slotKey}
        />
        {/* Invisible overlay used purely for measureInWindow targeting */}
        <View
          ref={(v) => { slotRefs.current[slotKey] = v; }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          collapsable={false}
        />
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Root View fills the entire screen so the flying element (absolute, top/left=0)
  // shares the same coordinate origin as measureInWindow.
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Planificador</Text>
          {filledCount > 0 && (
            <Pressable onPress={clearAll} style={styles.clearBtn} hitSlop={8}>
              <Ionicons name="trash-outline" size={17} color={COLORS.textMuted} />
              <Text style={styles.clearText}>Limpiar</Text>
            </Pressable>
          )}
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Flat-lay capture zone */}
          <ViewShot
            ref={viewShotRef as any}
            options={{ format: 'png', quality: 0.95 }}
            style={styles.flatLay}
          >
            <View style={styles.slotsGrid}>
              {slotWrapper('top')}
              {slotWrapper('bottom')}
              {slotWrapper('shoes')}
              {slotWrapper('accessory')}
            </View>
          </ViewShot>

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable
              style={[styles.shareBtn, filledCount === 0 && styles.btnDisabled]}
              onPress={handleShare}
            >
              <Ionicons
                name="share-outline"
                size={17}
                color={filledCount === 0 ? COLORS.textMuted : COLORS.text}
              />
              <Text style={[styles.shareBtnText, filledCount === 0 && { color: COLORS.textMuted }]}>
                Compartir
              </Text>
            </Pressable>
            <Pressable
              style={[styles.saveBtn, !canSave && styles.btnDisabled]}
              onPress={() => canSave && setShowDatePicker(true)}
              disabled={!canSave}
            >
              <Ionicons name="calendar-outline" size={17} color="#fff" />
              <Text style={styles.saveBtnText}>Guardar en calendario</Text>
            </Pressable>
          </View>

          {filledCount < 2 && (
            <Text style={styles.hint}>Agrega al menos 2 prendas para guardar el look</Text>
          )}

          {/* Garment grid */}
          <View style={styles.gridHeader}>
            <Text style={styles.gridTitle}>Tu clóset</Text>
            <Text style={styles.gridSub}>
              {activeGarments.length} prendas · toca para añadir
            </Text>
          </View>

          {activeGarments.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="shirt-outline" size={44} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>Clóset vacío</Text>
              <Text style={styles.emptySub}>
                Añade prendas en la pestaña Clóset para planificar looks
              </Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {activeGarments.map((g) => (
                <GarmentGridItem
                  key={g.id}
                  garment={g}
                  isInSlot={garmentSlotMap.has(g.id)}
                  onPress={handleGarmentPress}
                />
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* Flying garment — absolute within the full-screen root View */}
      {flyingGarment && (
        <Animated.View style={flyStyle} pointerEvents="none">
          <Image
            source={{
              uri: flyingGarment.thumbnail_url ?? flyingGarment.processed_url ?? flyingGarment.original_url,
            }}
            style={{ width: GARMENT_THUMB, height: GARMENT_THUMB }}
            contentFit="cover"
          />
        </Animated.View>
      )}

      <DatePickerModal
        visible={showDatePicker}
        preselectedDate={prefilledDate}
        isSaving={isSaving}
        onConfirm={handleConfirmDate}
        onClose={() => setShowDatePicker(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  safeArea: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  title: { fontSize: 28, fontWeight: '700', color: COLORS.text },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 },
  clearText: { fontSize: 13, color: COLORS.textMuted },

  scrollContent: { paddingBottom: SPACING.xl + 24 },

  // Flat-lay
  flatLay: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xs,
    backgroundColor: COLORS.background,
  },
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  slotWrapper: {
    width: SLOT_W,
    height: SLOT_H,
    position: 'relative',
  },
  slotCard: {
    width: SLOT_W,
    height: SLOT_H,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
  },
  slotImage: { width: '100%', height: '100%' },
  slotNameBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  slotGarmentName: { fontSize: 11, fontWeight: '600', color: '#fff' },
  slotRemove: { position: 'absolute', top: 5, right: 5 },
  slotEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xs,
    gap: 5,
  },
  slotLabel: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary, textAlign: 'center' },
  slotHint: { fontSize: 10, color: COLORS.textMuted, textAlign: 'center' },

  // Actions
  actions: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    gap: SPACING.sm,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  shareBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
  },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  btnDisabled: { opacity: 0.4 },
  hint: {
    textAlign: 'center',
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },

  // Grid header
  gridHeader: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginTop: SPACING.md,
  },
  gridTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  gridSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },

  // Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SPACING.md,
    gap: SPACING.xs,
  },
  gridItem: { width: GRID_ITEM, marginBottom: 4 },
  gridThumb: {
    width: GRID_ITEM,
    height: GRID_ITEM,
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
  },
  gridInSlotOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,206,201,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridFavBadge: {
    position: 'absolute',
    top: 3,
    right: 3,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 6,
    padding: 2,
  },
  gridItemName: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 3,
    textAlign: 'center',
  },

  // Empty state
  empty: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  emptySub: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center' },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingBottom: Platform.OS === 'ios' ? 34 : SPACING.lg,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.xs,
  },
  modalActions: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    gap: SPACING.sm,
  },
  modalCancel: {
    flex: 0.38,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceAlt,
    alignItems: 'center',
  },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: COLORS.textSecondary },
  modalConfirm: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  modalConfirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
