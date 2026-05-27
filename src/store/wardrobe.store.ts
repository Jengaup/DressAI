import { create } from 'zustand';
import { supabase } from '@lib/supabase/client';
import type { Garment, GarmentType, GarmentSeason, UpdateGarmentInput } from '@types/database';

interface WardrobeFilters {
  type: GarmentType | null;
  season: GarmentSeason | null;
  occasion: string | null;
  color: string | null;
  searchQuery: string;
}

interface WardrobeState {
  garments: Garment[];
  isLoading: boolean;
  error: string | null;
  filters: WardrobeFilters;

  fetchGarments: () => Promise<void>;
  addGarment: (garment: Garment) => void;
  updateGarment: (id: string, updates: UpdateGarmentInput) => Promise<void>;
  deleteGarment: (id: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  setFilter: (key: keyof WardrobeFilters, value: WardrobeFilters[keyof WardrobeFilters]) => void;
  clearFilters: () => void;

  // Derived: apply local filters without re-fetching
  getFilteredGarments: () => Garment[];
}

const defaultFilters: WardrobeFilters = {
  type: null,
  season: null,
  occasion: null,
  color: null,
  searchQuery: '',
};

export const useWardrobeStore = create<WardrobeState>((set, get) => ({
  garments: [],
  isLoading: false,
  error: null,
  filters: defaultFilters,

  fetchGarments: async () => {
    set({ isLoading: true, error: null });
    const { data, error } = await supabase
      .from('garments')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      set({ error: error.message, isLoading: false });
      return;
    }
    set({ garments: (data as Garment[]) ?? [], isLoading: false });
  },

  addGarment: (garment) =>
    set((state) => ({ garments: [garment, ...state.garments] })),

  updateGarment: async (id, updates) => {
    const { error } = await supabase
      .from('garments')
      .update(updates)
      .eq('id', id);

    if (error) throw new Error(error.message);

    set((state) => ({
      garments: state.garments.map((g) =>
        g.id === id ? { ...g, ...updates } : g,
      ),
    }));
  },

  deleteGarment: async (id) => {
    // Soft delete: mark inactive
    const { error } = await supabase
      .from('garments')
      .update({ is_active: false })
      .eq('id', id);

    if (error) throw new Error(error.message);

    set((state) => ({
      garments: state.garments.filter((g) => g.id !== id),
    }));
  },

  toggleFavorite: async (id) => {
    const garment = get().garments.find((g) => g.id === id);
    if (!garment) return;

    const newValue = !garment.is_favorite;
    await get().updateGarment(id, { is_favorite: newValue });
  },

  setFilter: (key, value) =>
    set((state) => ({ filters: { ...state.filters, [key]: value } })),

  clearFilters: () => set({ filters: defaultFilters }),

  getFilteredGarments: () => {
    const { garments, filters } = get();
    return garments.filter((g) => {
      if (filters.type && g.type !== filters.type) return false;
      if (filters.season && !g.season.includes(filters.season) && !g.season.includes('all')) return false;
      if (filters.occasion && !g.occasions.includes(filters.occasion)) return false;
      if (filters.color && g.primary_color !== filters.color) return false;
      if (filters.searchQuery) {
        const q = filters.searchQuery.toLowerCase();
        const haystack = [g.name, g.brand, g.color_label, g.type, ...(g.tags ?? [])].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  },
}));
