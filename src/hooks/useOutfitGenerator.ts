import { useState, useCallback, useRef, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { useGarments } from '@hooks/useGarments';
import { useAuthStore } from '@store/auth.store';
import { useOutfitStore } from '@store/outfit.store';
import {
  generateOutfitWithClaude,
  saveOutfit,
  buildCacheKey,
} from '@services/outfitService';
import type {
  GeneratorStatus,
  OutfitGenerationPreferences,
  OutfitSuggestion,
  GeneratorCacheEntry,
  OutfitServiceError,
} from '@types/outfit';
import { DEFAULT_PREFERENCES } from '@types/outfit';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum ms between generation calls — prevents double-taps and spam */
const MIN_CALL_INTERVAL_MS = 6_000;

/** Cache TTL: 5 minutes. Same gardrobe + prefs won't re-call the API. */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Number of past generations tracked to avoid repetition */
const MAX_HISTORY = 10;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOutfitGenerator() {
  const { user } = useAuthStore();
  const { garments } = useGarments();
  const { addOutfit } = useOutfitStore();
  const qc = useQueryClient();

  // ── Generator state ─────────────────────────────────────────────────────────
  const [status, setStatus] = useState<GeneratorStatus>('idle');
  const [suggestions, setSuggestions] = useState<OutfitSuggestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<OutfitGenerationPreferences>(
    DEFAULT_PREFERENCES,
  );

  // ── Countdown for rate-limit UX ─────────────────────────────────────────────
  const [retryCountdown, setRetryCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Persistent refs (survive re-renders, no re-render on change) ────────────

  /** Sorted garment ID arrays of the last MAX_HISTORY generations */
  const historyRef = useRef<string[][]>([]);

  /** In-memory cache keyed by buildCacheKey() */
  const cacheRef = useRef<Map<string, GeneratorCacheEntry>>(new Map());

  /** Timestamp of the last successful API call */
  const lastCallRef = useRef<number>(0);

  // ── Rate-limit countdown helper ─────────────────────────────────────────────
  const startCountdown = useCallback((ms: number) => {
    const seconds = Math.ceil(ms / 1000);
    setRetryCountdown(seconds);

    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setRetryCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // ── Core generate action ─────────────────────────────────────────────────────
  const generate = useCallback(async () => {
    if (status === 'generating') return;

    setError(null);

    // ── 1. Wardrobe check ───────────────────────────────────────────────────
    if (garments.length < 2) {
      Toast.show({
        type: 'error',
        text1: 'Clóset insuficiente',
        text2: 'Agrega al menos 2 prendas para generar outfits',
      });
      return;
    }

    // ── 2. Rate limit check ─────────────────────────────────────────────────
    const now = Date.now();
    const elapsed = now - lastCallRef.current;
    if (elapsed < MIN_CALL_INTERVAL_MS && lastCallRef.current > 0) {
      const wait = MIN_CALL_INTERVAL_MS - elapsed;
      startCountdown(wait);
      Toast.show({
        type: 'info',
        text1: `Espera ${Math.ceil(wait / 1000)}s antes de generar de nuevo`,
      });
      return;
    }

    // ── 3. Cache check ──────────────────────────────────────────────────────
    const cacheKey = buildCacheKey(garments, preferences);
    const cached = cacheRef.current.get(cacheKey);
    if (cached && now - cached.generatedAt < CACHE_TTL_MS) {
      setSuggestions(cached.suggestions);
      setCurrentIndex(0);
      setStatus('success');
      Toast.show({
        type: 'info',
        text1: 'Mostrando resultados anteriores',
        text2: 'Sin cambios en tu clóset desde la última generación',
      });
      return;
    }

    // ── 4. Call API ─────────────────────────────────────────────────────────
    setStatus('generating');
    setSuggestions([]);
    setCurrentIndex(0);
    lastCallRef.current = now;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const results = await generateOutfitWithClaude(
        garments,
        preferences,
        historyRef.current,
      );

      // ── 5. Update history ─────────────────────────────────────────────────
      results.forEach((r) => {
        const ids = r.garments.map((g) => g.id).sort();
        historyRef.current = [ids, ...historyRef.current].slice(0, MAX_HISTORY);
      });

      // ── 6. Populate cache ─────────────────────────────────────────────────
      cacheRef.current.set(cacheKey, { suggestions: results, generatedAt: now });
      if (cacheRef.current.size > 20) {
        // Evict oldest entries to prevent memory growth
        const firstKey = cacheRef.current.keys().next().value;
        if (firstKey) cacheRef.current.delete(firstKey);
      }

      setSuggestions(results);
      setStatus('success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      const outfitErr = err as OutfitServiceError;
      const msg = outfitErr?.message ?? 'Error al generar outfit';

      setError(msg);
      setStatus('error');

      if (outfitErr?.code === 'RATE_LIMITED') {
        startCountdown(outfitErr.retryAfterMs ?? 10_000);
      }

      Toast.show({ type: 'error', text1: 'Error al generar', text2: msg });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [status, garments, preferences, startCountdown]);

  // ── Save to Supabase ─────────────────────────────────────────────────────────
  const { mutateAsync: persistOutfit, isPending: isSaving } = useMutation<
    ReturnType<typeof saveOutfit> extends Promise<infer T> ? T : never,
    OutfitServiceError,
    OutfitSuggestion
  >({
    mutationFn: (suggestion) => {
      if (!user) throw new Error('No autenticado');
      return saveOutfit(suggestion, user.id);
    },
    onSuccess: (saved) => {
      addOutfit(saved);
      qc.invalidateQueries({ queryKey: ['outfits'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Toast.show({ type: 'success', text1: 'Look guardado en tu clóset' });
    },
    onError: (err) => {
      Toast.show({ type: 'error', text1: 'No se pudo guardar', text2: err.message });
    },
  });

  // ── Invalidate cache when wardrobe changes ───────────────────────────────────
  const invalidateCache = useCallback(() => {
    cacheRef.current.clear();
  }, []);

  // ── Navigation between suggestions ──────────────────────────────────────────
  const goNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(i + 1, suggestions.length - 1));
    Haptics.selectionAsync();
  }, [suggestions.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => Math.max(i - 1, 0));
    Haptics.selectionAsync();
  }, []);

  // ── Derived values ───────────────────────────────────────────────────────────
  const currentSuggestion = suggestions[currentIndex] ?? null;

  const canGenerate = useMemo(
    () => status !== 'generating' && retryCountdown === 0 && garments.length >= 2,
    [status, retryCountdown, garments.length],
  );

  return {
    // State
    status,
    suggestions,
    currentSuggestion,
    currentIndex,
    error,
    retryCountdown,
    isSaving,

    // Preferences
    preferences,
    setPreferences,

    // Actions
    generate,
    saveCurrentSuggestion: () =>
      currentSuggestion ? persistOutfit(currentSuggestion) : Promise.resolve(),
    saveSuggestion: persistOutfit,
    goNext,
    goPrev,
    invalidateCache,

    // Derived
    canGenerate,
    totalSuggestions: suggestions.length,
    wardrobeCount: garments.length,
  };
}
