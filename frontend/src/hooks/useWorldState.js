import { useCallback, useEffect, useRef, useState } from "react";
import {
  apiConfigured,
  fetchMapState,
  fetchWorldState,
  selectScenario as requestScenario,
  simulateTurn as requestSimulateTurn,
} from "../services/simulatorApi";
import { createDemoService } from "../services/simulationService";

const pollInterval = Number(import.meta.env.VITE_POLL_INTERVAL_MS) || 2000;
const configuredMode = import.meta.env.VITE_DATA_MODE === "api" ? "api" : "demo";

export function useWorldState({ demo = configuredMode === "demo", paused = false }) {
  const demoService = useRef(createDemoService());
  const inFlightCount = useRef(0);
  const mounted = useRef(true);
  const sourceVersion = useRef(0);
  const activeSource = useRef(demo);
  const mapRef = useRef(null);
  const [world, setWorld] = useState(null);
  const [connection, setConnection] = useState("connecting");
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = useCallback(async () => {
    if (inFlightCount.current > 0 || activeSource.current !== demo) return;
    const version = sourceVersion.current;
    inFlightCount.current += 1;
    try {
      const state = demo ? await demoService.current.advance() : await fetchWorldState();
      if (!mounted.current || activeSource.current !== demo || sourceVersion.current !== version) return;
      let map = mapRef.current;
      if (!demo && !map) {
        map = await fetchMapState();
        if (!mounted.current || activeSource.current !== demo || sourceVersion.current !== version) return;
        mapRef.current = map;
      }
      setWorld(demo ? state : { ...state, ...(map || {}) });
      setConnection("connected");
      setError("");
      setLastUpdated(new Date());
    } catch (loadError) {
      if (!mounted.current || sourceVersion.current !== version) return;
      setConnection("error");
      setError(loadError.message);
    } finally {
      inFlightCount.current = Math.max(0, inFlightCount.current - 1);
    }
  }, [demo]);

  const reset = useCallback(async () => {
    if (!demo || activeSource.current !== demo) return;
    const version = sourceVersion.current;
    try {
      const state = await demoService.current.reset();
      if (!mounted.current || sourceVersion.current !== version || activeSource.current !== demo) return;
      setWorld(state);
      setLastUpdated(new Date());
      setConnection("connected");
      setError("");
    } catch (resetError) {
      if (mounted.current && sourceVersion.current === version) setError(resetError.message);
    }
  }, [demo]);

  const refreshMap = useCallback(async () => {
    if (demo || inFlightCount.current > 0 || activeSource.current !== demo) return false;
    const version = sourceVersion.current;
    inFlightCount.current += 1;
    try {
      const map = await fetchMapState();
      if (!mounted.current || activeSource.current !== demo || sourceVersion.current !== version) return false;
      mapRef.current = map;
      setWorld((current) => current ? { ...current, ...map } : current);
      setLastUpdated(new Date());
      setConnection("connected");
      setError("");
      return true;
    } catch (loadError) {
      if (mounted.current && sourceVersion.current === version) {
        setConnection("error");
        setError(loadError.message);
      }
      return false;
    } finally {
      inFlightCount.current = Math.max(0, inFlightCount.current - 1);
    }
  }, [demo]);

  const loadScenario = useCallback(async (scenario) => {
    if (demo || activeSource.current !== demo) return false;
    // A scenario reset supersedes any poll started against the previous world.
    const version = ++sourceVersion.current;
    inFlightCount.current += 1;
    try {
      await requestScenario(scenario);
      if (!mounted.current || activeSource.current !== demo || sourceVersion.current !== version) return false;
      const state = await fetchWorldState();
      if (!mounted.current || activeSource.current !== demo || sourceVersion.current !== version) return false;
      setWorld({ ...state, ...(mapRef.current || {}) });
      setConnection("connected");
      setError("");
      setLastUpdated(new Date());
      return true;
    } catch (loadError) {
      if (mounted.current && sourceVersion.current === version) {
        setConnection("error");
        setError(loadError.message);
      }
      return false;
    } finally {
      inFlightCount.current = Math.max(0, inFlightCount.current - 1);
    }
  }, [demo]);

  const advanceTurn = useCallback(async () => {
    if (demo || activeSource.current !== demo) return false;
    const version = ++sourceVersion.current;
    inFlightCount.current += 1;
    try {
      const result = await requestSimulateTurn();
      if (!mounted.current || activeSource.current !== demo || sourceVersion.current !== version) return false;
      if (typeof result?.turno !== "number" || !Number.isFinite(result.turno)) {
        throw new Error("POST /simular-turno no devolvió un número de turno válido.");
      }
      const state = await fetchWorldState();
      if (!mounted.current || activeSource.current !== demo || sourceVersion.current !== version) return false;
      setWorld({ ...state, ...(mapRef.current || {}) });
      setConnection("connected");
      setError("");
      setLastUpdated(new Date());
      return true;
    } catch (loadError) {
      if (mounted.current && sourceVersion.current === version) {
        setConnection("error");
        setError(loadError.message);
      }
      return false;
    } finally {
      inFlightCount.current = Math.max(0, inFlightCount.current - 1);
    }
  }, [demo]);

  useEffect(() => {
    mounted.current = true;
    activeSource.current = demo;
    const version = ++sourceVersion.current;
    mapRef.current = null;
    // Never show entities from the previous source while the next mode loads.
    setWorld(null);
    setConnection("connecting");
    setError("");

    const isCurrent = () =>
      mounted.current && sourceVersion.current === version && activeSource.current === demo;

    const initialLoad = async () => {
      inFlightCount.current += 1;
      try {
        const state = demo ? await demoService.current.getState() : await fetchWorldState();
        if (!isCurrent()) return;
        if (!demo) {
          const map = await fetchMapState();
          if (!isCurrent()) return;
          mapRef.current = map;
          setWorld({ ...state, ...map });
        } else {
          setWorld(state);
        }
        setConnection("connected");
        setError("");
        setLastUpdated(new Date());
      } catch (loadError) {
        if (!isCurrent()) return;
        setConnection("error");
        setError(loadError.message);
      } finally {
        inFlightCount.current = Math.max(0, inFlightCount.current - 1);
      }
    };

    initialLoad();
    return () => {
      if (sourceVersion.current === version) sourceVersion.current += 1;
      mounted.current = false;
      mapRef.current = null;
    };
  }, [demo]);

  useEffect(() => {
    if (paused) return undefined;
    const timer = window.setInterval(load, pollInterval);
    return () => window.clearInterval(timer);
  }, [load, paused]);

  return {
    world,
    connection: demo ? "connected" : (apiConfigured ? connection : "error"),
    error: demo ? "" : error || (!apiConfigured ? "Configura VITE_API_BASE_URL para conectar con el backend." : ""),
    lastUpdated,
    reset,
    refresh: load,
    refreshMap,
    loadScenario,
    advanceTurn,
    pollInterval,
  };
}
