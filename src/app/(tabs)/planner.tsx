import { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, runOnJS,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Toast from 'react-native-toast-message';
import { useWardrobeStore } from '@store/wardrobe.store';
import { useOutfitStore } from '@store/outfit.store';
import { PlannerGarmentItem } from '@components/planner/PlannerGarmentItem';
import { PlannerCanvas } from '@components/planner/PlannerCanvas';
import { supabase } from '@lib/supabase/client';
import { useAuthStore } from '@store/auth.store';
import { COLORS, SPACING } from '@constants/theme';
import type { GarmentPosition, Garment } from '@types/database';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CANVAS_HEIGHT = SCREEN_WIDTH * 1.2;

interface CanvasItem {
  garment: Garment;
  position: GarmentPosition;
}

export default function PlannerScreen() {
  const { garments } = useWardrobeStore();
  const { addOutfit } = useOutfitStore();
  const { user } = useAuthStore();

  const [canvasItems, setCanvasItems] = useState<CanvasItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const handleAddToCanvas = useCallback((garment: Garment) => {
    const alreadyAdded = canvasItems.some((i) => i.garment.id === garment.id);
    if (alreadyAdded) return;

    setCanvasItems((prev) => [
      ...prev,
      {
        garment,
        position: {
          x: 60 + Math.random() * (SCREEN_WIDTH - 180),
          y: 60 + Math.random() * (CANVAS_HEIGHT - 180),
          scale: 1,
          rotation: 0,
          zIndex: prev.length,
        },
      },
    ]);
  }, [canvasItems]);

  const handlePositionChange = useCallback((garmentId: string, position: GarmentPosition) => {
    setCanvasItems((prev) =>
      prev.map((item) =>
        item.garment.id === garmentId ? { ...item, position } : item,
      ),
    );
  }, []);

  const handleRemoveFromCanvas = useCallback((garmentId: string) => {
    setCanvasItems((prev) => prev.filter((i) => i.garment.id !== garmentId));
  }, []);

  const handleSaveOutfit = useCallback(async () => {
    if (canvasItems.length === 0) {
      Toast.show({ type: 'error', text1: 'Canvas vacío', text2: 'Agrega prendas al canvas primero' });
      return;
    }
    if (!user) return;

    setIsSaving(true);
    try {
      // 1. Create outfit record
      const { data: outfit, error: outfitError } = await supabase
        .from('outfits')
        .insert({ user_id: user.id, source: 'manual' })
        .select()
        .single();

      if (outfitError || !outfit) throw new Error(outfitError?.message);

      // 2. Create outfit_garments with canvas positions
      const outfitGarments = canvasItems.map((item) => ({
        outfit_id: outfit.id,
        garment_id: item.garment.id,
        position: item.position,
      }));

      const { error: junctionError } = await supabase
        .from('outfit_garments')
        .insert(outfitGarments);

      if (junctionError) throw new Error(junctionError.message);

      const outfitWithGarments = {
        ...outfit,
        outfit_garments: canvasItems.map((item) => ({
          outfit_id: outfit.id,
          garment_id: item.garment.id,
          position: item.position,
          garment: item.garment,
        })),
      };

      addOutfit(outfitWithGarments);
      setCanvasItems([]);
      Toast.show({ type: 'success', text1: 'Look guardado correctamente' });
      router.push(`/outfit/${outfit.id}`);
    } catch {
      Toast.show({ type: 'error', text1: 'Error al guardar el look' });
    } finally {
      setIsSaving(false);
    }
  }, [canvasItems, user, addOutfit]);

  const activePrendas = garments.filter((g) => g.is_active);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Planificador</Text>
        {canvasItems.length > 0 && (
          <Pressable
            style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
            onPress={handleSaveOutfit}
            disabled={isSaving}
          >
            <Text style={styles.saveBtnText}>
              {isSaving ? 'Guardando...' : 'Guardar look'}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Canvas */}
      <PlannerCanvas
        items={canvasItems}
        onPositionChange={handlePositionChange}
        onRemove={handleRemoveFromCanvas}
        height={CANVAS_HEIGHT}
      />

      {/* Garment tray */}
      <View style={styles.tray}>
        <Text style={styles.trayLabel}>Arrastra prendas al canvas</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.trayScroll}
        >
          {activePrendas.map((garment) => (
            <PlannerGarmentItem
              key={garment.id}
              garment={garment}
              isOnCanvas={canvasItems.some((i) => i.garment.id === garment.id)}
              onPress={() => handleAddToCanvas(garment)}
            />
          ))}
        </ScrollView>
      </View>
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
  saveBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: 20,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  tray: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  trayLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.xs,
  },
  trayScroll: { paddingHorizontal: SPACING.sm, gap: 8 },
});
