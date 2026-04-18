import { useAuthStore } from "@/stores/authStore";

export function useHydrated() {
  return useAuthStore((state) => state.hydrated);
}
