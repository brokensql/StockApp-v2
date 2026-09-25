import { PROFILE_STORAGE_KEY, PROFILE_BACKUP_KEY } from './storageKeys';

export function getStoredStoreName(): string {
  if (typeof window === 'undefined') return 'My Store';
  try {
    const profileStr =
      localStorage.getItem(PROFILE_STORAGE_KEY) ||
      localStorage.getItem(PROFILE_BACKUP_KEY);
    if (profileStr) {
      const parsed = JSON.parse(profileStr);
      if (parsed?.storeName && parsed.storeName.trim()) {
        return parsed.storeName.trim();
      }
    }
  } catch {
    // ignore parsing errors
  }
  return 'My Store';
}
