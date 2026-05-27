import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar, type DateData } from 'react-native-calendars';
import { router } from 'expo-router';
import { format, parseISO, isToday, isFuture, isPast, isThisMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@store/auth.store';
import { usePlannerStore } from '@store/planner.store';
import {
  getMonthEntries,
  getEntryByDate,
  removeOutfitFromDate,
  getStreakDays,
  getTopGarmentThisMonth,
} from '@services/calendarService';
import { COLORS, SPACING, RADIUS } from '@constants/theme';
import type { CalendarEntryWithOutfit, Garment } from '@types/database';

// ─── Constants ────────────────────────────────────────────────────────────────

const TODAY_STR = format(new Date(), 'yyyy-MM-dd');
const DAY_CELL_SIZE = 32;
const THUMB_SIZE = 26;

// ─── Custom day cell ──────────────────────────────────────────────────────────

interface DayProps {
  date?: DateData;
  state?: 'selected' | 'disabled' | 'today' | '';
  marking?: Record<string, unknown>;
}

interface CustomDayProps extends DayProps {
  entry: CalendarEntryWithOutfit | undefined;
  selectedDate: string;
  onPress: (dateString: string) => void;
}

const CustomDay = memo(function CustomDay({
  date,
  state,
  entry,
  selectedDate,
  onPress,
}: CustomDayProps) {
  if (!date) return <View style={{ width: DAY_CELL_SIZE, height: DAY_CELL_SIZE + 8 }} />;

  const isSelected = date.dateString === selectedDate;
  const isDisabled = state === 'disabled';
  const isTodayDate = date.dateString === TODAY_STR;

  const thumb = entry?.outfit?.outfit_garments?.[0]?.garment?.thumbnail_url
    ?? entry?.outfit?.outfit_garments?.[0]?.garment?.processed_url;
  const isPlanned = entry?.type === 'planned';

  return (
    <Pressable
      onPress={() => !isDisabled && onPress(date.dateString)}
      style={styles.dayCell}
    >
      {/* Thumbnail behind the number */}
      {thumb && !isSelected && (
        <Image source={{ uri: thumb }} style={styles.dayThumb} contentFit="cover" />
      )}

      {/* Day number circle */}
      <View
        style={[
          styles.dayCircle,
          isSelected && { backgroundColor: COLORS.primary },
          isTodayDate && !isSelected && { borderWidth: 1.5, borderColor: COLORS.primaryLight },
        ]}
      >
        <Text
          style={[
            styles.dayText,
            isDisabled && { color: COLORS.textMuted },
            isSelected && { color: '#fff', fontWeight: '700' },
            isTodayDate && !isSelected && { color: COLORS.primaryLight, fontWeight: '600' },
          ]}
        >
          {date.day}
        </Text>
      </View>

      {/* Entry indicator dot */}
      {entry && (
        <View
          style={[
            styles.dayDot,
            { backgroundColor: isPlanned ? COLORS.accent : COLORS.success },
          ]}
        />
      )}
    </Pressable>
  );
});

// ─── Stats banner ─────────────────────────────────────────────────────────────

interface StatsBannerProps {
  streak: number;
  topGarment: { garment: Garment; count: number } | null;
}

function StatsBanner({ streak, topGarment }: StatsBannerProps) {
  return (
    <View style={styles.statsBanner}>
      <View style={styles.statCard}>
        <Text style={styles.statValue}>{streak}</Text>
        <Text style={styles.statLabel}>
          {streak === 1 ? 'día sin repetir' : 'días sin repetir'}
        </Text>
      </View>

      {topGarment && (
        <View style={[styles.statCard, styles.statCardRow]}>
          <Image
            source={{
              uri:
                topGarment.garment.thumbnail_url ??
                topGarment.garment.processed_url ??
                topGarment.garment.original_url,
            }}
            style={styles.statThumb}
            contentFit="cover"
          />
          <View style={styles.statTextGroup}>
            <Text style={styles.statLabel}>Más usada este mes</Text>
            <Text style={styles.statGarmentName} numberOfLines={1}>
              {topGarment.garment.name ?? topGarment.garment.type}
            </Text>
            <Text style={styles.statSubValue}>×{topGarment.count} looks</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Day detail panel ─────────────────────────────────────────────────────────

interface DayDetailProps {
  date: string;
  entry: CalendarEntryWithOutfit | null | undefined;
  isLoading: boolean;
  onRemove: (entryId: string) => void;
  onPlanOutfit: (date: string) => void;
}

function DayDetail({ date, entry, isLoading, onRemove, onPlanOutfit }: DayDetailProps) {
  const dateObj = new Date(date + 'T12:00:00');
  const past = isPast(dateObj) && !isToday(dateObj);
  const future = isFuture(dateObj);
  const today = isToday(dateObj);

  if (isLoading) {
    return (
      <View style={styles.detailLoading}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  if (entry?.outfit) {
    const garments = entry.outfit.outfit_garments.map((og) => og.garment).filter(Boolean) as Garment[];
    const thumbs = garments.slice(0, 4);

    return (
      <View style={styles.detailCard}>
        <View style={styles.detailThumbRow}>
          {thumbs.map((g) => (
            <Image
              key={g.id}
              source={{ uri: g.thumbnail_url ?? g.processed_url ?? g.original_url }}
              style={styles.detailThumb}
              contentFit="cover"
            />
          ))}
        </View>

        <View style={styles.detailInfo}>
          <Text style={styles.detailOutfitName} numberOfLines={1}>
            {entry.outfit.name ?? 'Look del día'}
          </Text>
          <View style={[
            styles.detailTypeBadge,
            { backgroundColor: entry.type === 'worn' ? COLORS.success + '33' : COLORS.accent + '33' },
          ]}>
            <Text style={[
              styles.detailTypeText,
              { color: entry.type === 'worn' ? COLORS.success : COLORS.accent },
            ]}>
              {entry.type === 'worn' ? 'Usado' : 'Planificado'}
            </Text>
          </View>
        </View>

        <View style={styles.detailActions}>
          <Pressable
            style={styles.detailBtn}
            onPress={() => router.push(`/outfit/${entry.outfit!.id}`)}
          >
            <Ionicons name="eye-outline" size={15} color={COLORS.primary} />
            <Text style={styles.detailBtnText}>Ver look</Text>
          </Pressable>
          <Pressable
            style={[styles.detailBtn, styles.detailBtnDestructive]}
            onPress={() => onRemove(entry.id)}
          >
            <Ionicons name="trash-outline" size={15} color={COLORS.error} />
            <Text style={[styles.detailBtnText, { color: COLORS.error }]}>Quitar</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // No outfit for this day
  return (
    <View style={styles.detailEmpty}>
      {past ? (
        <>
          <Ionicons name="time-outline" size={32} color={COLORS.textMuted} />
          <Text style={styles.detailEmptyTitle}>Día sin registro</Text>
          <Text style={styles.detailEmptyText}>No hay outfit guardado para este día</Text>
        </>
      ) : (
        <>
          <Ionicons
            name={today ? 'today-outline' : 'calendar-outline'}
            size={32}
            color={COLORS.primary}
          />
          <Text style={styles.detailEmptyTitle}>
            {today ? 'Sin look para hoy' : 'Día libre'}
          </Text>
          <Text style={styles.detailEmptyText}>
            {today
              ? '¿Qué te vas a poner hoy?'
              : 'Planifica un outfit para este día'}
          </Text>
          <Pressable style={styles.planBtn} onPress={() => onPlanOutfit(date)}>
            <Ionicons name="sparkles-outline" size={15} color="#fff" />
            <Text style={styles.planBtnText}>Planificar outfit</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

// ─── Upcoming outfit item ─────────────────────────────────────────────────────

function UpcomingItem({ entry }: { entry: CalendarEntryWithOutfit }) {
  const garments = entry.outfit?.outfit_garments.map((og) => og.garment).filter(Boolean) as Garment[] ?? [];
  const dateObj = new Date(entry.date + 'T12:00:00');

  return (
    <Pressable
      style={styles.upcomingItem}
      onPress={() => entry.outfit && router.push(`/outfit/${entry.outfit.id}`)}
    >
      <View style={styles.upcomingDateBox}>
        <Text style={styles.upcomingDay}>
          {format(dateObj, 'd', { locale: es })}
        </Text>
        <Text style={styles.upcomingMonth}>
          {format(dateObj, 'MMM', { locale: es }).toUpperCase()}
        </Text>
      </View>
      <View style={styles.upcomingThumbs}>
        {garments.slice(0, 3).map((g) => (
          <Image
            key={g.id}
            source={{ uri: g.thumbnail_url ?? g.processed_url ?? g.original_url }}
            style={styles.upcomingThumb}
            contentFit="cover"
          />
        ))}
      </View>
      <View style={styles.upcomingInfo}>
        <Text style={styles.upcomingName} numberOfLines={1}>
          {entry.outfit?.name ?? 'Look planificado'}
        </Text>
        <Text style={styles.upcomingDateStr}>
          {format(dateObj, "EEEE", { locale: es })}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
    </Pressable>
  );
}

// ─── CalendarScreen ───────────────────────────────────────────────────────────

export default function CalendarScreen() {
  const { user } = useAuthStore();
  const { setPendingDate } = usePlannerStore();
  const qc = useQueryClient();

  const now = new Date();
  const [viewYear, setViewYear]   = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState(TODAY_STR);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const { data: monthEntries = [], isLoading: isLoadingMonth, refetch: refetchMonth } = useQuery({
    queryKey: ['calendar', 'month', user?.id, viewYear, viewMonth],
    queryFn: () => getMonthEntries(user!.id, viewYear, viewMonth),
    enabled: !!user?.id,
    staleTime: 2 * 60 * 1000,
  });

  const { data: selectedEntry, isLoading: isLoadingDay, refetch: refetchDay } = useQuery({
    queryKey: ['calendar', 'day', user?.id, selectedDate],
    queryFn: () => getEntryByDate(user!.id, selectedDate),
    enabled: !!user?.id,
    staleTime: 60 * 1000,
  });

  const { data: streak = 0 } = useQuery({
    queryKey: ['calendar', 'streak', user?.id],
    queryFn: () => getStreakDays(user!.id),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const { data: topGarment = null } = useQuery({
    queryKey: ['calendar', 'top-garment', user?.id, now.getMonth() + 1],
    queryFn: () => getTopGarmentThisMonth(user!.id),
    enabled: !!user?.id && isThisMonth(now),
    staleTime: 5 * 60 * 1000,
  });

  // ── Entry map for fast lookups (calendar rendering) ───────────────────────

  const entryMap = useMemo(() => {
    const map = new Map<string, CalendarEntryWithOutfit>();
    for (const e of monthEntries) map.set(e.date, e);
    return map;
  }, [monthEntries]);

  // ── Upcoming outfits (future planned entries) ──────────────────────────────

  const upcomingEntries = useMemo(
    () =>
      monthEntries
        .filter((e) => e.type === 'planned' && isFuture(new Date(e.date + 'T12:00:00')))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 10),
    [monthEntries],
  );

  // ── MarkedDates for the calendar ───────────────────────────────────────────
  const markedDates = useMemo(() => {
    const result: Record<string, { selected?: boolean; selectedColor?: string }> = {};
    result[selectedDate] = { selected: true, selectedColor: COLORS.primary };
    return result;
  }, [selectedDate]);

  // ── Day component (memoized factory) ──────────────────────────────────────

  const renderDay = useCallback(
    (props: DayProps) => (
      <CustomDay
        {...props}
        entry={props.date ? entryMap.get(props.date.dateString) : undefined}
        selectedDate={selectedDate}
        onPress={setSelectedDate}
      />
    ),
    [entryMap, selectedDate],
  );

  // ── Month change ───────────────────────────────────────────────────────────

  const handleMonthChange = useCallback((month: DateData) => {
    setViewYear(month.year);
    setViewMonth(month.month);
  }, []);

  // ── Remove outfit from date ────────────────────────────────────────────────

  const handleRemove = useCallback(
    async (entryId: string) => {
      await removeOutfitFromDate(entryId);
      qc.invalidateQueries({ queryKey: ['calendar'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    [qc],
  );

  // ── Navigate to planner for a given date ──────────────────────────────────

  const handlePlanOutfit = useCallback(
    (date: string) => {
      setPendingDate(date);
      router.navigate('/(tabs)/planner' as any);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
    [setPendingDate],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  const formattedSelected = useMemo(
    () =>
      format(parseISO(selectedDate), "EEEE d 'de' MMMM", { locale: es }),
    [selectedDate],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} stickyHeaderIndices={[0]}>
        {/* Sticky header */}
        <View style={styles.header}>
          <Text style={styles.title}>Calendario</Text>
          {isLoadingMonth && (
            <ActivityIndicator size="small" color={COLORS.primary} style={{ marginRight: SPACING.sm }} />
          )}
        </View>

        {/* Stats banner */}
        {(streak > 0 || topGarment) && (
          <StatsBanner streak={streak} topGarment={topGarment} />
        )}

        {/* Calendar */}
        <View style={styles.calendarWrapper}>
          <Calendar
            current={`${viewYear}-${String(viewMonth).padStart(2, '0')}-01`}
            markedDates={markedDates}
            dayComponent={renderDay}
            onMonthChange={handleMonthChange}
            hideExtraDays
            theme={{
              backgroundColor: COLORS.background,
              calendarBackground: COLORS.background,
              textSectionTitleColor: COLORS.textMuted,
              arrowColor: COLORS.primary,
              monthTextColor: COLORS.text,
              textMonthFontWeight: '700',
              textDayHeaderFontWeight: '500',
              textDayHeaderFontSize: 12,
              todayTextColor: COLORS.primaryLight,
            }}
          />
        </View>

        {/* Legend */}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: COLORS.success }]} />
            <Text style={styles.legendText}>Usado</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: COLORS.accent }]} />
            <Text style={styles.legendText}>Planificado</Text>
          </View>
        </View>

        {/* Day detail */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle} numberOfLines={1}>
            {formattedSelected.charAt(0).toUpperCase() + formattedSelected.slice(1)}
          </Text>
          <DayDetail
            date={selectedDate}
            entry={selectedEntry}
            isLoading={isLoadingDay}
            onRemove={handleRemove}
            onPlanOutfit={handlePlanOutfit}
          />
        </View>

        {/* Upcoming outfits */}
        {upcomingEntries.length > 0 && (
          <View style={[styles.section, styles.upcomingSection]}>
            <Text style={styles.sectionTitle}>Próximos looks</Text>
            {upcomingEntries.map((entry) => (
              <UpcomingItem key={entry.id} entry={entry} />
            ))}
          </View>
        )}

        <View style={{ height: SPACING.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.background,
  },
  title: { fontSize: 28, fontWeight: '700', color: COLORS.text },

  // Stats banner
  statsBanner: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 2,
  },
  statValue: { fontSize: 28, fontWeight: '800', color: COLORS.primary },
  statLabel: { fontSize: 11, color: COLORS.textMuted, textAlign: 'center' },
  statThumb: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceAlt,
  },
  statTextGroup: { flex: 1 },
  statGarmentName: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  statSubValue: { fontSize: 11, color: COLORS.textMuted },

  // Calendar
  calendarWrapper: {
    marginHorizontal: SPACING.xs,
  },

  // Legend
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.lg,
    paddingVertical: SPACING.xs,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, color: COLORS.textMuted },

  // Custom day cell
  dayCell: {
    width: DAY_CELL_SIZE,
    height: DAY_CELL_SIZE + 10,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 2,
  },
  dayThumb: {
    position: 'absolute',
    top: 1,
    width: DAY_CELL_SIZE,
    height: DAY_CELL_SIZE,
    borderRadius: DAY_CELL_SIZE / 2,
    opacity: 0.45,
  },
  dayCircle: {
    width: DAY_CELL_SIZE,
    height: DAY_CELL_SIZE,
    borderRadius: DAY_CELL_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: { fontSize: 13, color: COLORS.text },
  dayDot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 2 },

  // Section
  section: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginTop: SPACING.sm,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.sm,
    textTransform: 'capitalize',
  },

  // Day detail
  detailLoading: {
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  detailThumbRow: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  detailThumb: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceAlt,
  },
  detailInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flexWrap: 'wrap',
  },
  detailOutfitName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  detailTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  detailTypeText: { fontSize: 12, fontWeight: '600' },
  detailActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  detailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceAlt,
  },
  detailBtnDestructive: { backgroundColor: COLORS.error + '18' },
  detailBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.primary },

  detailEmpty: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    gap: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  detailEmptyTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  detailEmptyText: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', paddingHorizontal: SPACING.lg },
  planBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: SPACING.xs,
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
  },
  planBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Upcoming
  upcomingSection: { marginTop: SPACING.md },
  upcomingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  upcomingDateBox: {
    width: 44,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
    paddingVertical: 4,
  },
  upcomingDay: { fontSize: 20, fontWeight: '800', color: COLORS.text, lineHeight: 22 },
  upcomingMonth: { fontSize: 10, color: COLORS.textMuted, fontWeight: '600' },
  upcomingThumbs: { flexDirection: 'row', gap: 3 },
  upcomingThumb: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceAlt,
  },
  upcomingInfo: { flex: 1 },
  upcomingName: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  upcomingDateStr: { fontSize: 12, color: COLORS.textMuted, textTransform: 'capitalize' },
});
