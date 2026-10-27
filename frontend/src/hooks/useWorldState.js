import { useCallback, useEffect, useRef, useState } from 'react';
import { apiConfigured, fetchWorldState } from '../services/simulatorApi';
import { createDemoService } from '../services/simulationService';

const pollInterval = Number(import.meta.env.VITE_POLL_INTERVAL_MS) || 2000;
const configuredMode = import.meta.env.VITE_DATA_MODE === 'api' ? 'api' : 'demo';

export function useWorldState({ demo = configuredMode === 'demo', paused = false }) {
  const demoService = useRef(createDemoService());
  const requestInFlight = useRef(false);
  const mounted = useRef(true);
  const activeSource = useRef(demo);
  const [world, setWorld] = useState(null);
  const [connection, setConnection] = useState('connecting');
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = useCallback(async () => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    try {
      const state = demo ? await demoService.current.advance() : await fetchWorldState();
      if (!mounted.current || activeSource.current !== demo) return;
      setWorld(state);
      setConnection('connected');
      setError('');
      setLastUpdated(new Date());
    } catch (loadError) {
      if (!mounted.current) return;
      setConnection('error');
      setError(loadError.message);
    } finally {
      requestInFlight.current = false;
    }
  }, [demo]);

  const reset = useCallback(async () => {
    if (demo) {
      const state = await demoService.current.reset();
      if (!mounted.current) return;
      setWorld(state);
      setLastUpdated(new Date());
      setConnection('connected');
      setError('');
    }
  }, [demo]);

  useEffect(() => {
    mounted.current = true;
    activeSource.current = demo;
    const initialLoad = async () => {
      if (requestInFlight.current) return;
      requestInFlight.current = true;
      try {
        const state = demo ? await demoService.current.getState() : await fetchWorldState();
        if (!mounted.current) return;
        setWorld(state);
        setConnection('connected');
        setLastUpdated(new Date());
      } catch (loadError) {
        if (!mounted.current) return;
        setConnection('error');
        setError(loadError.message);
      } finally {
        requestInFlight.current = false;
      }
    };
    initialLoad();
    return () => { mounted.current = false; };
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
