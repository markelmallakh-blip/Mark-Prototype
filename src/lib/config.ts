import { useEffect, useState } from 'react';
import type { AppConfig } from '../../shared/types';
import { api } from './api';

let pending: Promise<AppConfig> | null = null;

export function useConfig() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    pending ??= api<AppConfig>('/config');
    pending.then(setConfig, (e: Error) => {
      pending = null;
      setError(e.message);
    });
  }, []);
  return { config, error };
}
