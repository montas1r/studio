
import type { Mindmap } from '@/types/mindmap';

const MINDMAPS_STORAGE_KEY = 'snapGraphMindmaps';

export function getMindmapsFromStorage(): Mindmap[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const storedMindmaps = localStorage.getItem(MINDMAPS_STORAGE_KEY);
    return storedMindmaps ? JSON.parse(storedMindmaps) : [];
  } catch (error) {
    console.error('Error reading mindmaps from local storage:', error);
    return [];
  }
}

export function saveMindmapsToStorage(mindmaps: Mindmap[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(MINDMAPS_STORAGE_KEY, JSON.stringify(mindmaps));
  } catch (error) {
    console.error('Error saving mindmaps to local storage:', error);
  }
}
