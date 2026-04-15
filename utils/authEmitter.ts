type AuthListener = (isUnlocked: boolean) => void;

const listeners = new Set<AuthListener>();

export const authEmitter = {
  emit(isUnlocked: boolean) {
    listeners.forEach((fn) => fn(isUnlocked));
  },
  subscribe(fn: AuthListener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
