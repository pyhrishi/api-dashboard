import { useStore } from './store';

export function useActiveEnvironmentData() {
  const store = useStore();
  const environment = store.environment;
  
  const activeKeys = store.activeKeys.filter(k => k.environment === environment);
  
  return {
    environment,
    activeKeys,
  };
}
