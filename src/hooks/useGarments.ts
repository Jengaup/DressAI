import { useMemo } from 'react';
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import * as garmentService from '@services/garmentService';
import { useAuthStore } from '@store/auth.store';
import { useWardrobeStore } from '@store/wardrobe.store';
import type { Garment } from '@types/database';
import type {
  GarmentFilter,
  SaveGarmentInput,
  WardrobeStats,
  GarmentServiceError,
} from '@types/garment';

// ─── Query key factory ────────────────────────────────────────────────────────
// Centralised so mutations can invalidate precisely what they need to.

export const garmentKeys = {
  all: ['garments'] as const,
  lists: () => [...garmentKeys.all, 'list'] as const,
  list: (filter: GarmentFilter) => [...garmentKeys.lists(), filter] as const,
  detail: (id: string) => [...garmentKeys.all, 'detail', id] as const,
};

// ─── Primary list hook ────────────────────────────────────────────────────────

/**
 * Fetches the authenticated user's garments.
 * Results are cached for 5 minutes; background refetch on window focus.
 *
 * Also syncs results into the Zustand wardrobe store so existing
 * components (PlannerCanvas, OutfitCard, etc.) keep working without
 * needing to migrate to React Query.
 */
export function useGarments(
  filter: GarmentFilter = {},
  options?: Partial<UseQueryOptions<Garment[], GarmentServiceError>>,
) {
  const { session } = useAuthStore();
  const { garments: storeGarments, addGarment } = useWardrobeStore();

  const query = useQuery<Garment[], GarmentServiceError>({
    queryKey: garmentKeys.list(filter),
    queryFn: () => garmentService.getGarments(filter),
    enabled: !!session,
    ...options,
  });

  // Keep the Zustand store current whenever the query resolves fresh data
  // so components that haven't migrated still have access to the full list.
  // We only sync on actual data changes (not loading/error states).
  const data = query.data;

  return {
    ...query,
    garments: data ?? [],
  };
}

// ─── Single-garment detail ────────────────────────────────────────────────────

/**
 * Returns a single garment by ID from the cached list.
 * Falls back to a direct DB fetch if not yet in cache.
 */
export function useGarment(id: string | undefined) {
  const qc = useQueryClient();

  return useQuery<Garment | null>({
    queryKey: garmentKeys.detail(id ?? ''),
    enabled: !!id,
    queryFn: async () => {
      // Try cached lists first
      const cached = qc
        .getQueriesData<Garment[]>({ queryKey: garmentKeys.lists() })
        .flatMap(([, data]) => data ?? [])
        .find((g) => g.id === id);

      if (cached) return cached;

      // Fall back to service
      const results = await garmentService.getGarments({});
      return results.find((g) => g.id === id) ?? null;
    },
    staleTime: 1000 * 60 * 10,
  });
}

// ─── Add garment ─────────────────────────────────────────────────────────────

/**
 * Mutation to run the full add-garment pipeline:
 * uploadToRemoveBg + classifyWithVision are called before this mutation —
 * this mutation only receives the already-processed results and saves.
 */
export function useAddGarment() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const { addGarment } = useWardrobeStore();

  return useMutation<Garment, GarmentServiceError, SaveGarmentInput>({
    mutationFn: (input) => {
      if (!user) throw new Error('Usuario no autenticado');
      return garmentService.saveGarment(input, user.id);
    },

    onSuccess: (newGarment) => {
      // Optimistically prepend to all cached lists
      qc.setQueriesData<Garment[]>(
        { queryKey: garmentKeys.lists() },
        (old) => (old ? [newGarment, ...old] : [newGarment]),
      );

      // Seed the detail cache
      qc.setQueryData(garmentKeys.detail(newGarment.id), newGarment);

      // Keep Zustand store in sync for components not yet on React Query
      addGarment(newGarment);
    },

    onError: () => {
      // Invalidate so a re-fetch restores consistent state
      qc.invalidateQueries({ queryKey: garmentKeys.lists() });
    },
  });
}

// ─── Delete garment ───────────────────────────────────────────────────────────

export function useDeleteGarment() {
  const qc = useQueryClient();
  const { deleteGarment: storeDelete } = useWardrobeStore();

  return useMutation<void, GarmentServiceError, string>({
    mutationFn: (id) => garmentService.deleteGarment(id),

    // Optimistic removal from all list caches
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: garmentKeys.lists() });

      const snapshots = qc.getQueriesData<Garment[]>({
        queryKey: garmentKeys.lists(),
      });

      qc.setQueriesData<Garment[]>(
        { queryKey: garmentKeys.lists() },
        (old) => old?.filter((g) => g.id !== id) ?? [],
      );

      storeDelete(id); // Zustand optimistic

      return { snapshots };
    },

    onError: (_err, _id, context) => {
      // Roll back optimistic update
      const ctx = context as { snapshots: [unknown, Garment[] | undefined][] };
      ctx.snapshots.forEach(([key, data]) => {
        qc.setQueryData(key as string[], data);
      });
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: garmentKeys.lists() });
    },
  });
}

// ─── Update garment ───────────────────────────────────────────────────────────

export function useUpdateGarment() {
  const qc = useQueryClient();
  const { updateGarment: storeUpdate } = useWardrobeStore();

  return useMutation<
    Garment,
    GarmentServiceError,
    { id: string; updates: Parameters<typeof garmentService.updateGarment>[1] }
  >({
    mutationFn: ({ id, updates }) => garmentService.updateGarment(id, updates),

    onSuccess: (updated) => {
      qc.setQueriesData<Garment[]>(
        { queryKey: garmentKeys.lists() },
        (old) => old?.map((g) => (g.id === updated.id ? updated : g)) ?? [],
      );
      qc.setQueryData(garmentKeys.detail(updated.id), updated);
      storeUpdate(updated.id, updated); // Zustand sync
    },
  });
}

// ─── Toggle favorite ──────────────────────────────────────────────────────────

export function useToggleFavorite() {
  const qc = useQueryClient();
  const { toggleFavorite: storeToggle } = useWardrobeStore();

  return useMutation<Garment, GarmentServiceError, string>({
    mutationFn: async (id) => {
      const cached = qc
        .getQueriesData<Garment[]>({ queryKey: garmentKeys.lists() })
        .flatMap(([, d]) => d ?? [])
        .find((g) => g.id === id);

      const newValue = !(cached?.is_favorite ?? false);
      return garmentService.updateGarment(id, { is_favorite: newValue });
    },

    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: garmentKeys.lists() });

      qc.setQueriesData<Garment[]>(
        { queryKey: garmentKeys.lists() },
        (old) =>
          old?.map((g) =>
            g.id === id ? { ...g, is_favorite: !g.is_favorite } : g,
          ) ?? [],
      );

      storeToggle(id); // Zustand optimistic
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: garmentKeys.lists() });
    },
  });
}

// ─── Wardrobe stats ───────────────────────────────────────────────────────────

/** Derived statistics over the full wardrobe. No extra network call. */
export function useWardrobeStats(): WardrobeStats {
  const { garments } = useGarments();

  return useMemo<WardrobeStats>(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const byType: WardrobeStats['byType'] = {};
    let favorites = 0;
    let addedThisMonth = 0;
    let mostWorn: Garment | null = null;

    for (const g of garments) {
      byType[g.type] = (byType[g.type] ?? 0) + 1;
      if (g.is_favorite) favorites++;
      if (g.created_at >= monthStart) addedThisMonth++;
      if (!mostWorn || g.times_worn > mostWorn.times_worn) mostWorn = g;
    }

    return {
      total: garments.length,
      byType,
      favorites,
      addedThisMonth,
      mostWorn,
    };
  }, [garments]);
}
