export const RECOVERY_STORAGE_WARNING =
  'Browser recovery storage is unavailable. Keep this tab open until your changes are saved; reload recovery may not work.';

function storage() {
  return typeof window === 'undefined' ? null : window.sessionStorage;
}

function fail(onFailure, error) {
  onFailure?.(RECOVERY_STORAGE_WARNING, error);
}

export function safeStorageGet(key, onFailure) {
  try {
    return storage()?.getItem(key) ?? null;
  } catch (error) {
    fail(onFailure, error);
    return null;
  }
}

export function safeStorageSet(key, value, onFailure) {
  try {
    storage()?.setItem(key, value);
    return true;
  } catch (error) {
    fail(onFailure, error);
    return false;
  }
}

export function safeStorageRemove(key, onFailure) {
  try {
    storage()?.removeItem(key);
    return true;
  } catch (error) {
    fail(onFailure, error);
    return false;
  }
}

export function safeStorageKeys(onFailure) {
  try {
    return Object.keys(storage() || {});
  } catch (error) {
    fail(onFailure, error);
    return [];
  }
}
