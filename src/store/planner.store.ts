import { create } from 'zustand';

interface PlannerStoreState {
  pendingDate: string | null; // 'YYYY-MM-DD' — cleared when Planner mounts and picks it up
  setPendingDate: (date: string | null) => void;
}

export const usePlannerStore = create<PlannerStoreState>((set) => ({
  pendingDate: null,
  setPendingDate: (date) => set({ pendingDate: date }),
}));
