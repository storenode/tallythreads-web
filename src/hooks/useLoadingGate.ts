import { useCallback, useState } from "react";

export function useLoadingGate() {
  const [pending, setPending] = useState(0);

  const withLoading = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T> => {
      setPending((n) => n + 1);
      try {
        return await fn();
      } finally {
        setPending((n) => n - 1);
      }
    },
    [],
  );

  return { isLoading: pending > 0, withLoading };
}
