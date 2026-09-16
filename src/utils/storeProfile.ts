export function getStoredStoreName(): string {
  if (typeof window === 'undefined') return 'My Store';
  try {
    const profileStr =
      localStorage.getItem('sage_user_profile') ||
      localStorage.getItem('sage_user_profile_backup');
    if (profileStr) {
      const parsed = JSON.parse(profileStr);
      if (parsed?.storeName && parsed.storeName.trim()) {
        return parsed.storeName.trim();
      }
    }

    const backup = localStorage.getItem('stock_app_store_name_backup');
    if (backup && backup.trim()) {
      return backup.trim();
    }
  } catch {
    // ignore parsing errors
  }
  return 'My Store';
}
