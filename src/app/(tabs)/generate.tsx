import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { useWardrobeStore } from '@store/wardrobe.store';
import { useOutfitStore } from '@store/outfit.store';
import { generateOutfit } from '@lib/ai/outfit-generator';
import { OutfitCard } from '@components/outfit/OutfitCard';
import { OccasionPicker } from '@components/outfit/OccasionPicker';
import { COLORS, SPACING } from '@constants/theme';
import type { OutfitWithGarments } from '@types/database';

const OCCASIONS = ['Casual', 'Trabajo', 'Formal', 'Deporte', 'Cita', 'Fiesta'];

export default function GenerateScreen() {
  const { garments } = useWardrobeStore();
  const { addOutfit } = useOutfitStore();

  const [selectedOccasion, setSelectedOccasion] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<OutfitWithGarments[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = useCallback(async () => {
    if (garments.length < 2) {
      Toast.show({
        type: 'error',
        text1: 'Clóset insuficiente',
        text2: 'Agrega al menos 2 prendas para generar outfits',
      });
      return;
    }

    setIsGenerating(true);
    setSuggestions([]);

    try {
      const result = await generateOutfit({
        garments,
        occasion: selectedOccasion ?? 'casual',
      });
      setSuggestions(result);
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: 'Error al generar',
        text2: 'Inténtalo de nuevo en un momento',
      });
    } finally {
      setIsGenerating(false);
    }
  }, [garments, selectedOccasion]);

  const handleSaveOutfit = useCallback(
    async (outfit: OutfitWithGarments) => {
      addOutfit(outfit);
      Toast.show({ type: 'success', text1: 'Outfit guardado' });
    },
    [addOutfit],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Generar Outfit</Text>
          <Text style={styles.subtitle}>
            La IA combinará tus prendas por color, estilo y ocasión
          </Text>
        </View>

        {/* Occasion selector */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>¿Para qué ocasión?</Text>
          <OccasionPicker
            occasions={OCCASIONS}
            selected={selectedOccasion}
            onSelect={setSelectedOccasion}
          />
        </View>

        {/* Generate button */}
        <Pressable
          style={[styles.generateBtn, isGenerating && styles.generateBtnDisabled]}
          onPress={handleGenerate}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Ionicons name="sparkles" size={20} color="#fff" />
          )}
          <Text style={styles.generateBtnText}>
            {isGenerating ? 'Generando...' : 'Generar 3 outfits'}
          </Text>
        </Pressable>

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Sugerencias</Text>
            {suggestions.map((outfit) => (
              <OutfitCard
                key={outfit.id}
                outfit={outfit}
                showSaveButton
                onSave={() => handleSaveOutfit(outfit)}
              />
            ))}
          </View>
        )}

        {/* Empty state */}
        {!isGenerating && suggestions.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="color-wand-outline" size={64} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>
              Selecciona una ocasión y presiona generar
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, paddingBottom: SPACING.md },
  title: { fontSize: 28, fontWeight: '700', color: COLORS.text },
  subtitle: { fontSize: 14, color: COLORS.textMuted, marginTop: 4 },
  section: { paddingHorizontal: SPACING.md, marginBottom: SPACING.lg },
  sectionLabel: { fontSize: 15, fontWeight: '600', color: COLORS.text, marginBottom: SPACING.sm },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    marginHorizontal: SPACING.md,
    paddingVertical: 16,
    borderRadius: 14,
    marginBottom: SPACING.lg,
  },
  generateBtnDisabled: { opacity: 0.6 },
  generateBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  emptyState: {
    alignItems: 'center',
    paddingTop: SPACING.xl * 2,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingHorizontal: SPACING.xl,
  },
});
