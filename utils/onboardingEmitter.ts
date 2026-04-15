// utils/onboardingEmitter.ts
// Tiny event emitter that replaces the 1-second AsyncStorage polling interval
// in _layout.tsx. When onboarding completes (index.tsx), call emit() once.
// _layout.tsx subscribes and immediately marks itself as onboarded.

type Listener = () => void;

const listeners = new Set<Listener>();

export const onboardingEmitter = {
  emit() {
    listeners.forEach((fn) => fn());
  },
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
