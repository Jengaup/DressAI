import { create } from 'zustand';
import { supabase } from '@lib/supabase/client';
import type { Outfit, OutfitWithGarments } from '@types/database';

interface OutfitState {
  outfits: OutfitWithGarments[];
  isLoading: boolean;
  error: string | null;

  fetchOutfits: () => Promise<void>;
  addOutfit: (outfit: OutfitWithGarments) => void;
  removeOutfit: (id: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  getById: (id: string) => OutfitWithGarments | undefined;
}

export const useOutfitStore = create<OutfitState>((set, get) => ({
  outfits: [],
  isLoading: false,
  error: null,

  fetchOutfits: async () => {
    set({ isLoading: true, error: null });
    const { data, error } = await supabase
      .from('outfits')
      .select(`
        *,
        outfit_garments (
          *,
          garment:garments (*)
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      set({ error: error.message, isLoading: false });
      return;
    }
    set({ outfits: (data as OutfitWithGarments[]) ?? [], isLoading: false });
  },

  addOutfit: (outfit) =>
    set((state) => ({ outfits: [outfit, ...state.outfits] })),

  removeOutfit: async (id) => {
    const { error } = await supabase.from('outfits').delete().eq('id', id);
    if (error) throw new Error(error.message);
    set((state) => ({ outfits: state.outfits.filter((o) => o.id !== id) }));
  },

  toggleFavorite: async (id) => {
    const outfit = get().outfits.find((o) => o.id === id);
    if (!outfit) return;

    const newValue = !outfit.is_favorite;
    const { error } = await supabase
      .from('outfits')
      .update({ is_favorite: newValue })
      .eq('id', id);

    if (error) throw new Error(error.message);

    set((state) => ({
      outfits: state.outfits.map((o) =>
        o.id === id ? { ...o, is_favorite: newValue } : o,
      ),
    }));
  },

  getById: (id) => get().outfits.find((o) => o.id === id),
}));
