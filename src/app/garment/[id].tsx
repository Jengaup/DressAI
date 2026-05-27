import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Pressable, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { useWardrobeStore } from '@store/wardrobe.store';
import { deleteGarmentImages } from '@lib/supabase/storage';
import { useAuthStore } from '@store/auth.store';
import { GARMENT_TYPE_LABELS, COLORS, SPACING } from '@constants/theme';
import { ColorSwatch } from '@components/ui/ColorSwatch';
import { TagChip } from '@components/ui/TagChip';

export default function GarmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { garments, deleteGarment, toggleFavorite } = useWardrobeStore();
  const { user } = useAuthStore();

  const garment = garments.find((g) => g.id === id);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!garment) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={COLORS.primary} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  const handleDelete = () => {
    Alert.alert(
      'Eliminar prenda',
      '¿Estás seguro? Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              if (user) {
                await deleteGarmentImages(user.id, garment.id);
              }
              await deleteGarment(garment.id);
              router.back();
            } catch {
              Toast.show({ type: 'error', text1: 'Error al eliminar la prenda' });
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </Pressable>
          <View style={styles.headerActions}>
            <Pressable onPress={() => toggleFavorite(garment.id)} style={styles.actionBtn}>
              <Ionicons
                name={garment.is_favorite ? 'heart' : 'heart-outline'}
                size={24}
                color={garment.is_favorite ? '#E74C3C' : COLORS.text}
              />
            </Pressable>
            <Pressable onPress={handleDelete} style={styles.actionBtn} disabled={isDeleting}>
              {isDeleting
                ? <ActivityIndicator size="small" color={COLORS.error} />
                : <Ionicons name="trash-outline" size={24} color={COLORS.error} />
              }
            </Pressable>
          </View>
        </View>

        {/* Image */}
        <Image
          source={{ uri: garment.processed_url ?? garment.original_url }}
          style={styles.image}
          contentFit="contain"
          transition={200}
        />

        {/* Info */}
        <View style={styles.info}>
          <Text style={styles.garmName}>{garment.name ?? GARMENT_TYPE_LABELS[garment.type]}</Text>
          {garment.brand && <Text style={styles.brand}>{garment.brand}</Text>}

          <View style={styles.row}>
            <ColorSwatch color={garment.primary_color} label={garment.color_label} />
            {garment.secondary_color && (
              <ColorSwatch color={garment.secondary_color} label="secundario" />
            )}
          </View>

          <View style={styles.statsRow}>
            <StatPill icon="repeat-outline" value={`${garment.times_worn}x usado`} />
            {garment.last_worn && (
              <StatPill icon="calendar-outline" value={`Último: ${garment.last_worn}`} />
            )}
          </View>

          {garment.occasions.length > 0 && (
            <View style={styles.tagsSection}>
              <Text style={styles.sectionLabel}>Ocasiones</Text>
              <View style={styles.tags}>
                {garment.occasions.map((o) => <TagChip key={o} label={o} />)}
              </View>
            </View>
          )}

          {garment.tags.length > 0 && (
            <View style={styles.tagsSection}>
              <Text style={styles.sectionLabel}>Etiquetas</Text>
              <View style={styles.tags}>
                {garment.tags.map((t) => <TagChip key={t} label={t} />)}
              </View>
            </View>
          )}

          {garment.notes && (
            <View style={styles.tagsSection}>
              <Text style={styles.sectionLabel}>Notas</Text>
              <Text style={styles.notes}>{garment.notes}</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatPill({ icon, value }: { icon: string; value: string }) {
  return (
    <View style={statStyles.pill}>
      <Ionicons name={icon as any} size={14} color={COLORS.textMuted} />
      <Text style={statStyles.text}>{value}</Text>
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
    paddingVertical: 6,
    borderRadius: 20,
  },
  text: { fontSize: 12, color: COLORS.textMuted },
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
  backBtn: { padding: 4 },
  headerActions: { flexDirection: 'row', gap: 12 },
  actionBtn: { padding: 4 },
  image: { width: '100%', height: 360, backgroundColor: COLORS.surface },
  info: { padding: SPACING.md, gap: SPACING.sm },
  garmName: { fontSize: 24, fontWeight: '700', color: COLORS.text },
  brand: { fontSize: 15, color: COLORS.textMuted },
  row: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  statsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  tagsSection: { gap: 8 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  tags: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  notes: { fontSize: 14, color: COLORS.text, lineHeight: 20 },
});
