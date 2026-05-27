import { useState, useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@store/auth.store';
import { useOutfitStore } from '@store/outfit.store';
import { saveOutfit } from '@services/outfitService';
import { saveOutfitToDate } from '@services/calendarService';
import type { Garment, GarmentType } from '@types/database';
import type { OutfitSuggestion } from '@types/outfit';

// ─── Slot types ───────────────────────────────────────────────────────────────

export type SlotKey = 'top' | 'bottom' | 'shoes' | 'accessory';

export interface PlannerSlots {
  top: Garment | null;
  bottom: Garment | null;
  shoes: Garment | null;
  accessory: Garment | null;
}

export interface SlotMeta {
  label: string;
  icon: string;
  hint: string;
}

export const SLOT_META: Record<SlotKey, SlotMeta> = {
  top:       { label: 'Top',              icon: 'shirt-outline',     hint: 'Camiseta, chaqueta, vestido…' },
  bottom:    { label: 'Pantalón / Falda', icon: 'layers-outline',    hint: 'Pantalón, falda, shorts…'     },
  shoes:     { label: 'Zapatos',          icon: 'footsteps-outline',  hint: 'Zapatos, botas, sandalias…'  },
  accessory: { label: 'Accesorio',        icon: 'watch-outline',      hint: 'Bolso, cinturón, joya…'      },
};

const SLOT_KEYS: SlotKey[] = ['top', 'bottom', 'shoes', 'accessory'];
const EMPTY_SLOTS: PlannerSlots = { top: null, bottom: null, shoes: null, accessory: null };

/** Deterministic mapping from garment type to the planner slot it belongs in */
export function typeToSlot(type: GarmentType): SlotKey {
  switch (type) {
    case 'top':
    case 'dress':
    case 'outerwear':
    case 'activewear':
    case 'swimwear':
    case 'underwear':
      return 'top';
    case 'bottom':
      return 'bottom';
    case 'shoes':
      return 'shoes';
    case 'bag':
    case 'accessory':
    default:
      return 'accessory';
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UsePlannerReturn {
  slots: PlannerSlots;
  assignGarment: (garment: Garment) => void;
  removeFromSlot: (slot: SlotKey) => void;
  clearAll: () => void;
  saveToCalendar: (date: string) => Promise<boolean>;
  filledSlots: Garment[];
  filledCount: number;
  canSave: boolean;
  isSaving: boolean;
  isSlotFilled: (slot: SlotKey) => boolean;
  getSlotGarment: (slot: SlotKey) => Garment | null;
  garmentSlotMap: Map<string, SlotKey>;
}

export function usePlanner(): UsePlannerReturn {
  const { user } = useAuthStore();
  const { addOutfit } = useOutfitStore();
  const qc = useQueryClient();

  const [slots, setSlots] = useState<PlannerSlots>(EMPTY_SLOTS);
  const [isSaving, setIsSaving] = useState(false);

  const assignGarment = useCallback((garment: Garment) => {
    const slot = typeToSlot(garment.type);
    setSlots((prev) => ({ ...prev, [slot]: garment }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const removeFromSlot = useCallback((slot: SlotKey) => {
    setSlots((prev) => ({ ...prev, [slot]: null }));
    Haptics.selectionAsync();
  }, []);

  const clearAll = useCallback(() => {
    setSlots(EMPTY_SLOTS);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  // ── Derived ────────────────────────────────────────────────────────────────
  const filledSlots = SLOT_KEYS
    .map((k) => slots[k])
    .filter((g): g is Garment => g !== null);

  const filledCount = filledSlots.length;
  const canSave = filledCount >= 2;

  /** Quick lookup: garmentId → slot it occupies */
  const garmentSlotMap = new Map<string, SlotKey>(
    SLOT_KEYS
      .filter((k) => slots[k] !== null)
      .map((k) => [(slots[k] as Garment).id, k]),
  );

  const isSlotFilled = (slot: SlotKey) => slots[slot] !== null;
  const getSlotGarment = (slot: SlotKey) => slots[slot];

  // ── Save to calendar ───────────────────────────────────────────────────────
  const saveToCalendar = useCallback(
    async (date: string): Promise<boolean> => {
      if (!user || !canSave) return false;

      setIsSaving(true);
      try {
        const suggestion: OutfitSuggestion = {
          id: `planner-${Date.now()}`,
          garments: filledSlots,
          name: `Look ${date}`,
          tags: [],
          advice: '',
          color_harmony: 'neutro',
          occasion_fit: 80,
          mood: 'planificado',
        };

        const saved = await saveOutfit(suggestion, user.id);
        addOutfit(saved);
        qc.invalidateQueries({ queryKey: ['outfits'] });

        await saveOutfitToDate(saved.id, date, user.id);
        qc.invalidateQueries({ queryKey: ['calendar'] });

        Toast.show({
          type: 'success',
          text1: '¡Look guardado!',
          text2: `Planificado para el ${date}`,
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        clearAll();
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error al guardar';
        Toast.show({ type: 'error', text1: 'No se pudo guardar', text2: msg });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [user, canSave, filledSlots, addOutfit, qc, clearAll],
  );

  return {
    slots,
    assignGarment,
    removeFromSlot,
    clearAll,
    saveToCalendar,
    filledSlots,
    filledCount,
    canSave,
    isSaving,
    isSlotFilled,
    getSlotGarment,
    garmentSlotMap,
  };
}
