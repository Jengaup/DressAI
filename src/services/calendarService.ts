import { supabase } from '@lib/supabase/client';
import type {
  CalendarEntry,
  CalendarEntryWithOutfit,
  Garment,
} from '@types/database';

// ─── Error class ──────────────────────────────────────────────────────────────

export class CalendarServiceError extends Error {
  constructor(
    public readonly code: 'SAVE_FAILED' | 'FETCH_FAILED' | 'DELETE_FAILED',
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'CalendarServiceError';
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns today's date as a 'YYYY-MM-DD' string in local time. */
function todayString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Subtracts `days` calendar days from a 'YYYY-MM-DD' string. */
function subtractDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() - days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Deep-join select fragment shared across calendar queries. */
const CALENDAR_SELECT = `
  *,
  outfit:outfits (
    *,
    outfit_garments (
      *,
      garment:garments (*)
    )
  )
`.trim();

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * UPSERTs a calendar entry for the given user + date.
 * `type` is set to `'worn'` when the date is today or in the past,
 * `'planned'` when it is in the future.
 *
 * Conflict target: `(user_id, date)`.
 */
export async function saveOutfitToDate(
  outfitId: string,
  date: string,
  userId: string,
): Promise<CalendarEntry> {
  const type = date <= todayString() ? 'worn' : 'planned';

  const { data, error } = await supabase
    .from('calendar_entries')
    .upsert(
      { user_id: userId, outfit_id: outfitId, date, type },
      { onConflict: 'user_id,date' },
    )
    .select()
    .single();

  if (error || !data) {
    throw new CalendarServiceError(
      'SAVE_FAILED',
      error?.message ?? 'No se pudo guardar el outfit en la fecha indicada',
      error,
    );
  }

  return data as CalendarEntry;
}

/**
 * Fetches all calendar entries (with nested outfit + garments) for the
 * given user and calendar month.
 *
 * @param month  1-based month index (1 = January … 12 = December)
 */
export async function getMonthEntries(
  userId: string,
  year: number,
  month: number,
): Promise<CalendarEntryWithOutfit[]> {
  // Build YYYY-MM-DD boundaries for the month
  const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDayDate = new Date(year, month, 0); // day 0 of next month = last day of this month
  const lastDay = `${lastDayDate.getFullYear()}-${String(lastDayDate.getMonth() + 1).padStart(2, '0')}-${String(lastDayDate.getDate()).padStart(2, '0')}`;

  const { data, error } = await supabase
    .from('calendar_entries')
    .select(CALENDAR_SELECT)
    .eq('user_id', userId)
    .gte('date', firstDay)
    .lte('date', lastDay)
    .order('date', { ascending: true });

  if (error) {
    throw new CalendarServiceError(
      'FETCH_FAILED',
      error.message,
      error,
    );
  }

  return (data ?? []) as CalendarEntryWithOutfit[];
}

/**
 * Returns the calendar entry (with outfit + garments) for a specific date,
 * or `null` when no entry exists.
 */
export async function getEntryByDate(
  userId: string,
  date: string,
): Promise<CalendarEntryWithOutfit | null> {
  const { data, error } = await supabase
    .from('calendar_entries')
    .select(CALENDAR_SELECT)
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle();

  if (error) {
    throw new CalendarServiceError(
      'FETCH_FAILED',
      error.message,
      error,
    );
  }

  return (data as CalendarEntryWithOutfit | null) ?? null;
}

/**
 * Hard-deletes a calendar entry by its primary key.
 */
export async function removeOutfitFromDate(entryId: string): Promise<void> {
  const { error } = await supabase
    .from('calendar_entries')
    .delete()
    .eq('id', entryId);

  if (error) {
    throw new CalendarServiceError(
      'DELETE_FAILED',
      error.message,
      error,
    );
  }
}

/**
 * Counts consecutive days going back from today where the user wore a
 * distinct outfit (no outfit repeated).
 *
 * Algorithm:
 *  1. Fetch the last 60 'worn' entries ordered by date DESC.
 *  2. Build a Map<dateString, outfitId>.
 *  3. Start from today (skip today if no entry and start from yesterday).
 *  4. Walk back day by day — break on missing entry or repeated outfit_id.
 */
export async function getStreakDays(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('calendar_entries')
    .select('date, outfit_id')
    .eq('user_id', userId)
    .eq('type', 'worn')
    .order('date', { ascending: false })
    .limit(60);

  if (error) {
    throw new CalendarServiceError(
      'FETCH_FAILED',
      error.message,
      error,
    );
  }

  const entries = (data ?? []) as { date: string; outfit_id: string | null }[];

  // Build date → outfitId map
  const dateMap = new Map<string, string | null>();
  for (const entry of entries) {
    dateMap.set(entry.date, entry.outfit_id);
  }

  const today = todayString();
  let streak = 0;
  const seenOutfits = new Set<string>();

  // Determine starting point
  let current = dateMap.has(today) ? today : subtractDays(today, 1);

  while (true) {
    if (!dateMap.has(current)) break;

    const outfitId = dateMap.get(current);

    // Skip entries with no outfit assigned
    if (outfitId === null || outfitId === undefined) break;

    // Repeated outfit breaks the streak
    if (seenOutfits.has(outfitId)) break;

    seenOutfits.add(outfitId);
    streak += 1;
    current = subtractDays(current, 1);
  }

  return streak;
}

/**
 * Returns the most-worn garment this calendar month, along with a usage count.
 * Returns `null` when the current month has no entries with garments.
 */
export async function getTopGarmentThisMonth(
  userId: string,
): Promise<{ garment: Garment; count: number } | null> {
  const now = new Date();
  const entries = await getMonthEntries(userId, now.getFullYear(), now.getMonth() + 1);

  // Tally garment appearances across all outfit_garments in the month
  const garmentCount = new Map<string, number>();
  const garmentById = new Map<string, Garment>();

  for (const entry of entries) {
    if (!entry.outfit) continue;

    for (const og of entry.outfit.outfit_garments) {
      const { garment } = og;
      garmentById.set(garment.id, garment);
      garmentCount.set(garment.id, (garmentCount.get(garment.id) ?? 0) + 1);
    }
  }

  if (garmentCount.size === 0) return null;

  // Find the garment_id with the highest count
  let topId: string | null = null;
  let topCount = 0;

  for (const [id, count] of garmentCount) {
    if (count > topCount) {
      topCount = count;
      topId = id;
    }
  }

  if (!topId) return null;

  const garment = garmentById.get(topId);
  if (!garment) return null;

  return { garment, count: topCount };
}
