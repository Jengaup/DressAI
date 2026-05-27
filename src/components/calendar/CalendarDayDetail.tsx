import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@lib/supabase/client';
import { useAuthStore } from '@store/auth.store';
import { useOutfitStore } from '@store/outfit.store';
import { COLORS, SPACING, RADIUS } from '@constants/theme';
import type { CalendarEntryWithOutfit } from '@types/database';

interface Props {
  date: string;
  entry: CalendarEntryWithOutfit | null;
  onEntryUpdated: (entry: CalendarEntryWithOutfit) => void;
}

export function CalendarDayDetail({ date, entry, onEntryUpdated }: Props) {
  const { user } = useAuthStore();
  const { outfits } = useOutfitStore();

  const handleAssignOutfit = async (outfitId: string) => {
    if (!user) return;

    const payload = {
      user_id: user.id,
      outfit_id: outfitId,
      date,
      type: 'planned' as const,
    };

    const { data, error } = await supabase
      .from('calendar_entries')
      .upsert(payload, { onConflict: 'user_id,date' })
      .select(`
        *,
        outfit:outfits (
          *,
          outfit_garments (*, garment:garments (*))
        )
      `)
      .single();

    if (!error && data) {
      onEntryUpdated(data as CalendarEntryWithOutfit);
    }
  };

  if (entry?.outfit) {
    const garments = entry.outfit.outfit_garments.map((og) => og.garment).filter(Boolean);
    return (
      <View style={styles.container}>
        <View style={styles.entryHeader}>
          <View style={[styles.typeBadge, entry.type === 'worn' ? styles.wornBadge : styles.plannedBadge]}>
            <Text style={styles.typeBadgeText}>
              {entry.type === 'worn' ? '✓ Usado' : '📅 Planificado'}
            </Text>
          </View>
          <Pressable onPress={() => router.push(`/outfit/${entry.outfit!.id}`)}>
            <Text style={styles.viewLink}>Ver look →</Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbRow}>
          {garments.map((g) => (
            <Image
              key={g.id}
              source={{ uri: g.thumbnail_url ?? g.processed_url ?? g.original_url }}
              style={styles.thumb}
              contentFit="cover"
            />
          ))}
        </ScrollView>
      </View>
    );
  }

  // No entry: show outfit selection
  return (
    <View style={styles.container}>
      <Text style={styles.noEntryText}>Sin outfit asignado</Text>
      <Text style={styles.hint}>Selecciona un look guardado:</Text>
      <ScrollView showsVerticalScrollIndicator={false} style={styles.outfitList}>
        {outfits.slice(0, 5).map((o) => {
          const firstGarment = o.outfit_garments[0]?.garment;
          return (
            <Pressable key={o.id} style={styles.outfitRow} onPress={() => handleAssignOutfit(o.id)}>
              {firstGarment && (
                <Image
                  source={{ uri: firstGarment.thumbnail_url ?? firstGarment.processed_url ?? firstGarment.original_url }}
                  style={styles.outfitThumb}
                  contentFit="cover"
                />
              )}
              <Text style={styles.outfitName} numberOfLines={1}>
                {o.name ?? `Look ${o.occasion ?? ''}`}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  entryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  wornBadge: { backgroundColor: COLORS.success + '33' },
  plannedBadge: { backgroundColor: COLORS.accent + '33' },
  typeBadgeText: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  viewLink: { fontSize: 13, color: COLORS.primary, fontWeight: '600' },
  thumbRow: { marginTop: SPACING.xs },
  thumb: { width: 90, height: 110, borderRadius: RADIUS.sm, marginRight: SPACING.sm, backgroundColor: COLORS.surfaceAlt },
  noEntryText: { fontSize: 15, color: COLORS.textMuted, marginBottom: 4 },
  hint: { fontSize: 13, color: COLORS.textMuted, marginBottom: SPACING.sm },
  outfitList: { flex: 1 },
  outfitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  outfitThumb: { width: 44, height: 54, borderRadius: 8, backgroundColor: COLORS.surfaceAlt },
  outfitName: { flex: 1, fontSize: 14, color: COLORS.text },
});
