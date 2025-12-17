import { RiceVariety, VarietyDuration } from '../data/types';
import { RICE_VARIETIES } from '../data/riceVarieties';

/**
 * Get all rice varieties
 */
export function getAllVarieties(): RiceVariety[] {
  return RICE_VARIETIES;
}

/**
 * Get variety by ID
 */
export function getVarietyById(id: string): RiceVariety | undefined {
  return RICE_VARIETIES.find(v => v.id === id);
}

/**
 * Get variety by name (case-insensitive, checks aliases too)
 */
export function getVarietyByName(name: string): RiceVariety | undefined {
  const searchName = name.toLowerCase();
  return RICE_VARIETIES.find(
    v =>
      v.name.toLowerCase() === searchName ||
      v.aliases.some(alias => alias.toLowerCase() === searchName)
  );
}

/**
 * Get varieties by duration category
 */
export function getVarietiesByDuration(duration: VarietyDuration): RiceVariety[] {
  return RICE_VARIETIES.filter(v => {
    const avgDays = (v.maturityDays.min + v.maturityDays.max) / 2;
    if (duration === 'early') return avgDays < 110;
    if (duration === 'medium') return avgDays >= 110 && avgDays <= 120;
    return avgDays > 120;
  });
}

/**
 * Get variety names for dropdown
 */
export function getVarietyNames(): string[] {
  return RICE_VARIETIES.map(v => v.name);
}

/**
 * Search varieties by keyword (searches name, aliases, breeder, notes)
 */
export function searchVarieties(keyword: string): RiceVariety[] {
  const search = keyword.toLowerCase();
  return RICE_VARIETIES.filter(
    v =>
      v.name.toLowerCase().includes(search) ||
      v.aliases.some(alias => alias.toLowerCase().includes(search)) ||
      v.breeder.toLowerCase().includes(search) ||
      v.notes.toLowerCase().includes(search)
  );
}
