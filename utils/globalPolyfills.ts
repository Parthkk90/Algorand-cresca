import { Buffer } from 'buffer';
import AsyncStorage from '@react-native-async-storage/async-storage';

const toStorageString = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const patchAsyncStorage = () => {
  const storage = AsyncStorage as any;
  if (!storage || storage.__crescaPatched) return;

  const originalSetItem = storage.setItem?.bind(storage);
  if (originalSetItem) {
    storage.setItem = (key: unknown, value: unknown, callback?: (error?: Error | null) => void) => {
      return originalSetItem(toStorageString(key), toStorageString(value), callback);
    };
  }

  const originalMultiSet = storage.multiSet?.bind(storage);
  if (originalMultiSet) {
    storage.multiSet = (
      keyValuePairs: Array<[unknown, unknown]>,
      callback?: (errors?: Error[] | null) => void,
    ) => {
      const safePairs = (Array.isArray(keyValuePairs) ? keyValuePairs : []).map(([k, v]) => [
        toStorageString(k),
        toStorageString(v),
      ] as [string, string]);

      return originalMultiSet(safePairs, callback);
    };
  }

  storage.__crescaPatched = true;
};

patchAsyncStorage();

// Make Buffer globally available for ethers and other crypto libraries
if (typeof global !== 'undefined') {
  global.Buffer = Buffer;
}

// Also make it available on window for web environments
if (typeof window !== 'undefined') {
  (window as any).global = window;
  (window as any).Buffer = Buffer;
}