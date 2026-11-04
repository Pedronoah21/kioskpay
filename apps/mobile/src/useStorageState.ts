import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

/** Valor persistido: SecureStore no celular, localStorage na web. */
export function useStorageState(key: string) {
  const [isLoading, setIsLoading] = useState(true);
  const [value, setValue] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const stored =
          Platform.OS === 'web' ? globalThis.localStorage?.getItem(key) ?? null : await SecureStore.getItemAsync(key);
        setValue(stored);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [key]);

  const update = useCallback(
    async (next: string | null) => {
      setValue(next);
      if (Platform.OS === 'web') {
        if (next === null) globalThis.localStorage?.removeItem(key);
        else globalThis.localStorage?.setItem(key, next);
      } else if (next === null) {
        await SecureStore.deleteItemAsync(key);
      } else {
        await SecureStore.setItemAsync(key, next);
      }
    },
    [key],
  );

  return { value, isLoading, update };
}
