import { useCallback, useEffect, useRef, useState } from 'react';
import { apiConfigured, fetchWorldState } from '../services/api';
import { createDemoService } from '../services/simulationService';

const pollInterval = Number(import.meta.env.VITE_POLL_INTERVAL_MS) || 2000;

export function useWorldState({ demo = true, paused = false }) {
  const demoService = useRef(createDemoService());
  const [world, setWorld] = useState(null);
  const [connection, setConnection] = useState('connecting');
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = useCallback(async () => {
    try {
      const state = demo ? await demoService.current.advance() : await fetchWorldState();
      setWorld(state);
      setConnection('connected');
      setError('');
      setLastUpdated(new Date());
    } catch (loadError) {
      setConnection('error');
      setError(loadError.message);
    }
  }, [demo]);

  const reset = useCallback(async () => {
    if (demo) {
      const state = await demoService.current.reset();
      setWorld(state);
      setLastUpdated(new Date());
      setConnection('connected');
      setError('');
    }
  }, [demo]);

  useEffect(() => {
    let mounted = true;
    const initialLoad = async () => {
      try {
        const state = demo ? await demoService.current.getState() : await fetchWorldState();
        if (!mounted) return;
        setWorld(state);
        setConnection('connected');
        setLastUpdated(new Date());
      } catch (loadError) {
        if (!mounted) return;
        setConnection('error');
        setError(loadError.message);
      }
    };
    initialLoad();
    return () => { mounted = false; };
  }, [demo]);

  useEffect(() => {
    if (paused) return undefined;
    const timer = window.setInterval(load, pollInterval);
    return () => window.clearInterval(timer);
  }, [load, paused]);

  return {
    world,
    connection: demo ? 'connected' : (apiConfigured ? connection : 'error'),
    error: demo ? '' : error || (!apiConfigured ? 'Configura VITE_API_BASE_URL para conectar con el backend.' : ''),
    lastUpdated,
    reset,
    refresh: load,
    pollInterval,
  };
}
