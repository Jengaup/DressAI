import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar, type DateData } from 'react-native-calendars';
import { router } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '@lib/supabase/client';
import { CalendarDayDetail } from '@components/calendar/CalendarDayDetail';
import { COLORS, SPACING } from '@constants/theme';
import type { CalendarEntryWithOutfit } from '@types/database';

type MarkedDates = Record<string, { marked: boolean; dotColor: string; selected?: boolean; selectedColor?: string }>;

export default function CalendarScreen() {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [entries, setEntries] = useState<Record<string, CalendarEntryWithOutfit>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(format(new Date(), 'yyyy-MM'));

  const fetchMonthEntries = useCallback(async (monthStr: string) => {
    setIsLoading(true);
    const [year, month] = monthStr.split('-').map(Number);
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const to = `${year}-${String(month).padStart(2, '0')}-31`;

    const { data, error } = await supabase
      .from('calendar_entries')
      .select(`
        *,
        outfit:outfits (
          *,
          outfit_garments (*, garment:garments (*))
        )
      `)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false });

    if (!error && data) {
      const map: Record<string, CalendarEntryWithOutfit> = {};
      (data as CalendarEntryWithOutfit[]).forEach((entry) => {
        map[entry.date] = entry;
      });
      setEntries((prev) => ({ ...prev, ...map }));
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchMonthEntries(currentMonth);
  }, [currentMonth]);

  const markedDates: MarkedDates = Object.entries(entries).reduce<MarkedDates>(
    (acc, [date, entry]) => {
      acc[date] = {
        marked: true,
        dotColor: entry.type === 'worn' ? COLORS.primary : COLORS.accent,
        ...(date === selectedDate && {
          selected: true,
          selectedColor: COLORS.primary,
        }),
      };
      return acc;
    },
    {
      [selectedDate]: {
        marked: !!entries[selectedDate],
        dotColor: COLORS.primary,
        selected: true,
        selectedColor: COLORS.primary,
      },
    },
  );

  const selectedEntry = entries[selectedDate];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Calendario</Text>
      </View>

      <Calendar
        current={selectedDate}
        onDayPress={(day: DateData) => setSelectedDate(day.dateString)}
        onMonthChange={(month: DateData) =>
          setCurrentMonth(`${month.year}-${String(month.month).padStart(2, '0')}`)
        }
        markedDates={markedDates}
        theme={{
          backgroundColor: COLORS.background,
          calendarBackground: COLORS.background,
          textSectionTitleColor: COLORS.textMuted,
          selectedDayBackgroundColor: COLORS.primary,
          selectedDayTextColor: '#fff',
          todayTextColor: COLORS.primary,
          dayTextColor: COLORS.text,
          arrowColor: COLORS.primary,
          monthTextColor: COLORS.text,
          textDayFontWeight: '400',
          textMonthFontWeight: '700',
          textDayHeaderFontWeight: '500',
        }}
        style={styles.calendar}
      />

      {/* Day detail panel */}
      <View style={styles.detailPanel}>
        <Text style={styles.dateLabel}>
          {format(parseISO(selectedDate), "EEEE, d 'de' MMMM", { locale: es })}
        </Text>

        {isLoading ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING.md }} />
        ) : (
          <CalendarDayDetail
            date={selectedDate}
            entry={selectedEntry ?? null}
            onEntryUpdated={(entry) =>
              setEntries((prev) => ({ ...prev, [entry.date]: entry }))
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  title: { fontSize: 28, fontWeight: '700', color: COLORS.text },
  calendar: { marginHorizontal: SPACING.sm },
  detailPanel: {
    flex: 1,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  dateLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    textTransform: 'capitalize',
    marginBottom: SPACING.sm,
  },
});
