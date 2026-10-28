import { useEffect, useMemo, useState } from "react";
import Header from "./components/Header";
import StatsPanel from "./components/StatsPanel";
import SimulationControls from "./components/SimulationControls";
import MantaMap from "./components/MantaMap";
import RoutePanel from "./components/RoutePanel";
import EventLog from "./components/EventLog";
import SurvivalGuide from "./components/SurvivalGuide";
import { useWorldState } from "./hooks/useWorldState";
import { fetchSurvivorRoute, moveSurvivor, requestNextStep } from "./services/simulatorApi";
import {
  applyBlockOverrides,
  directedEdgeKey,
  hasDirectedConnection,
  isDirectedEdgeBlocked,
  recalculateWorldRoutes,
  updateBlockOverrides,
} from "./services/roadRouting.js";
import {
  createDisplayNames,
  displayEntityName,
  intersectionDisplayName,
} from "./utils/presentation";

export default function App() {
  const [mode, setMode] = useState(import.meta.env.VITE_DATA_MODE === "api" ? "api" : "demo");
  const [paused, setPaused] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [startedAt] = useState(Date.now());
  const { world, connection, error, lastUpdated, reset, refresh, refreshMap, loadScenario, advanceTurn, setDemoBlockedEdge, pollInterval } =
    useWorldState({ demo: mode === "demo", paused });
  const [elapsed, setElapsed] = useState("00:00");
  const [guideOpen, setGuideOpen] = useState(false);
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [turnLoading, setTurnLoading] = useState(false);
  const [stepLoading, setStepLoading] = useState(false);
  const [stepFeedback, setStepFeedback] = useState("");
  const [routeLookup, setRouteLookup] = useState({ key: "", status: "idle", route: null, error: "" });
  const [apiBlockOverrides, setApiBlockOverrides] = useState([]);
  const [apiLocalRouting, setApiLocalRouting] = useState(false);
  const stale = mode === "api" && lastUpdated && Date.now() - lastUpdated.getTime() > pollInterval * 3;
  const validApiBlockOverrides = useMemo(
    () => (apiBlockOverrides ?? []).filter((edge) =>
      hasDirectedConnection(world, edge.origen, edge.destino),
    ),
    [world?.nodos, world?.calles, apiBlockOverrides],
  );
  const invalidApiOverrideCount = apiBlockOverrides.length - validApiBlockOverrides.length;
  const activeWorld = useMemo(() => {
    if (mode !== "api" || !world || !apiLocalRouting) return world;
    const blockedEdges = applyBlockOverrides(world.aristasBloqueadas, validApiBlockOverrides);
    const recalculated = recalculateWorldRoutes({ ...world, aristasBloqueadas: blockedEdges }, blockedEdges);
    return {
      ...recalculated,
      bloqueosLocalesActivos: true,
      rutasCalculadasLocalmente: true,
      advertenciasBloqueosLocales: invalidApiOverrideCount
        ? [`${invalidApiOverrideCount} bloqueo(s) local(es) omitidos porque ya no existen en el grafo API actual.`]
        : [],
    };
  }, [mode, world, apiLocalRouting, validApiBlockOverrides, invalidApiOverrideCount]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      setElapsed(`${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  const switchMode = (nextMode) => {
    setPaused(false);
    setStepFeedback("");
    setApiBlockOverrides([]);
    setApiLocalRouting(false);
    setMode(nextMode);
  };

  useEffect(() => {
    const survivors = activeWorld?.sobrevivientes ?? [];
    const routes = activeWorld?.rutas ?? [];
    const survivorIds = new Set(survivors.map((survivor) => String(survivor.id)));
    const routeIds = routes
      .map((route) => route.survivorId ?? route.sobrevivienteId)
      .filter((id) => id != null)
      .map(String);
    const validIds = new Set([...survivorIds, ...routeIds]);
    if (selectedId != null && validIds.has(String(selectedId))) return;

    const routeForSurvivor = routes.find((route) => {
      const id = route.survivorId ?? route.sobrevivienteId;
      return id != null && survivorIds.has(String(id));
    });
    const routeId = routeForSurvivor?.survivorId ?? routeForSurvivor?.sobrevivienteId;
    const nextId = routeId ??
      survivors.find((survivor) => survivor.activo !== false)?.id ??
      survivors[0]?.id ?? routeIds[0] ?? null;
    setSelectedId(nextId == null ? null : String(nextId));
  }, [activeWorld, selectedId]);

  const routeFromState = useMemo(
    () => activeWorld?.rutas?.find(
      (route) => String(route.survivorId ?? route.sobrevivienteId ?? "") === selectedId,
    ),
    [activeWorld, selectedId],
  );
  const displayNames = useMemo(() => createDisplayNames(activeWorld), [
    activeWorld?.zombies,
    activeWorld?.sobrevivientes,
    activeWorld?.refugios,
  ]);
  const selectedSurvivor = useMemo(
    () => activeWorld?.sobrevivientes?.find((item) => String(item.id) === String(selectedId)),
    [activeWorld?.sobrevivientes, selectedId],
  );
  const routeStateKey = useMemo(() => {
    if (!activeWorld || !selectedSurvivor) return "";
    const zombieState = (activeWorld.zombies ?? []).map((zombie) => [
      zombie.id,
      zombie.nodo,
      zombie.tipo,
      zombie.visible,
      zombie.cantidad,
    ]);
    const refugeState = (activeWorld.refugios ?? []).map((refuge) => [
      refuge.id,
      refuge.nodo ?? refuge.node,
    ]);
    const blockedEdges = (activeWorld.aristasBloqueadas ?? [])
      .filter((edge) => Array.isArray(edge) && edge.length >= 2)
      .map((edge) => directedEdgeKey(edge[0], edge[1]))
      .sort();
    return JSON.stringify([
      activeWorld.turno,
      selectedSurvivor.id,
      selectedSurvivor.nodo,
      selectedSurvivor.refugioId,
      selectedSurvivor.activo,
      zombieState,
      refugeState,
      blockedEdges,
    ]);
  }, [activeWorld?.turno, activeWorld?.zombies, activeWorld?.aristasBloqueadas, selectedSurvivor]);
  useEffect(() => {
    let current = true;
    if (mode !== "api" || !selectedSurvivor || !routeStateKey) {
      setRouteLookup({ key: routeStateKey, status: "idle", route: null, error: "" });
      return () => { current = false; };
    }
    if (routeFromState) {
      setRouteLookup({ key: routeStateKey, status: "available", route: routeFromState, error: "" });
      return () => { current = false; };
    }

    setRouteLookup({ key: routeStateKey, status: "loading", route: null, error: "" });
    fetchSurvivorRoute(selectedSurvivor.id)
      .then((route) => {
        if (!current) return;
        setRouteLookup({
          key: routeStateKey,
          status: route ? "available" : "unavailable",
          route,
          error: "",
        });
      })
      .catch((routeError) => {
        if (!current) return;
        setRouteLookup({ key: routeStateKey, status: "error", route: null, error: routeError.message });
      });
    return () => { current = false; };
  }, [mode, selectedId, selectedSurvivor?.id, routeStateKey, routeFromState]);
  const selectedRoute = routeFromState ?? (
    routeLookup.key === routeStateKey ? routeLookup.route : null
  );
  const displayWorld = useMemo(() => {
    if (!activeWorld || !selectedRoute) return activeWorld;
    const routes = activeWorld.rutas ?? [];
    const routeId = String(selectedRoute.survivorId ?? selectedRoute.sobrevivienteId ?? "");
    if (routes.some((route) => String(route.survivorId ?? route.sobrevivienteId ?? "") === routeId)) {
      return activeWorld;
    }
    return { ...activeWorld, rutas: [...routes, selectedRoute] };
  }, [activeWorld, selectedRoute]);
  const visibleRouteLookup = routeLookup.key === routeStateKey ? routeLookup : null;
  const selectedNode = useMemo(
    () => activeWorld?.nodos?.find((node) => String(node.id) === String(selectedSurvivor?.nodo)),
    [activeWorld?.nodos, selectedSurvivor?.nodo],
  );

  const handleSetStreetBlocked = (origin, destination, blocked) => {
    if (mode === "demo") {
      const result = setDemoBlockedEdge(origin, destination, blocked);
      setStepFeedback(result.message);
      return result;
    }
    if (!world) return { ok: false, message: "El mapa API todavia no esta disponible." };
    const result = updateBlockOverrides(world, apiBlockOverrides, origin, destination, blocked);
    if (!result.ok) {
      return { ok: false, message: "La conexion seleccionada ya no existe en el grafo API recibido." };
    }
    setApiBlockOverrides(result.overrides);
    setApiLocalRouting(true);
    const message = result.changed
      ? `Bloqueo local ${blocked ? "aplicado" : "quitado"} en ${origin} -> ${destination}; rutas recalculadas en el navegador. No se guarda en el backend.`
      : "La conexion ya tenia ese estado.";
    setStepFeedback(message);
    return { ...result, message };
  };

  const handleResetApiLocalBlocks = () => {
    setApiBlockOverrides([]);
    setApiLocalRouting(false);
    setStepFeedback("Se quitaron los cambios de prueba locales; se conserva el estado recibido del backend.");
  };

  const handleLoadScenario = async (scenario) => {
    setScenarioLoading(true);
    setStepFeedback("");
    setApiBlockOverrides([]);
    setApiLocalRouting(false);
    try {
      await loadScenario(scenario);
    } finally {
      setScenarioLoading(false);
    }
  };

  const handleAdvanceTurn = async () => {
    if (mode === "api" && validApiBlockOverrides.length > 0) {
      setStepFeedback("Quita o reinicia los bloqueos locales antes de avanzar el turno del backend.");
      return;
    }
    setTurnLoading(true);
    setStepFeedback("");
    try {
      const updated = await advanceTurn();
      setStepFeedback(updated
        ? "Turno avanzado; estado, rutas y eventos actualizados desde el backend."
        : "No se pudo avanzar el turno. Revisa el estado de conexión y vuelve a intentarlo.");
    } finally {
      setTurnLoading(false);
    }
  };

  const handleAdvanceSelectedSurvivor = async () => {
    if (mode !== "api" || !selectedSurvivor?.activo || stepLoading) return;
    if (validApiBlockOverrides.length > 0) {
      setStepFeedback("Los bloqueos locales no se envian al backend. Quita o reinicia esos bloqueos antes de mover al sobreviviente.");
      return;
    }
    setStepLoading(true);
    setStepFeedback("");
    try {
      const response = await requestNextStep({
        sobrevivienteId: String(selectedSurvivor.id),
        nodoActual: String(selectedSurvivor.nodo),
        turno: Number(activeWorld.turno) || 0,
      });
      const destination = response?.siguienteNodo == null ? "" : String(response.siguienteNodo);
      if (!destination || destination === String(selectedSurvivor.nodo)) {
        setStepFeedback("El backend no indicó un siguiente paso seguro para este sobreviviente.");
        return;
      }

      const nodeExists = activeWorld.nodos?.some((node) => String(node.id) === destination);
      const connected = activeWorld.calles?.some((street) =>
        String(street.origen) === String(selectedSurvivor.nodo) && String(street.destino) === destination,
      );
      const blocked = isDirectedEdgeBlocked(activeWorld.aristasBloqueadas, selectedSurvivor.nodo, destination);
      if (!nodeExists || !connected || blocked) {
        setStepFeedback("El backend devolvió un paso que no coincide con una conexión del mapa. No se confirmó el movimiento.");
        return;
      }

      const result = await moveSurvivor({
        sobrevivienteId: String(selectedSurvivor.id),
        nodoDestino: destination,
      });
      if (result?.movido !== true) {
        setStepFeedback("El backend rechazó el movimiento. Actualiza el estado antes de volver a intentarlo.");
        await refresh();
        return;
      }
      setStepFeedback("Movimiento confirmado por el backend.");
      await refresh();
    } catch (stepError) {
      setStepFeedback(stepError.message || "No se pudo completar el paso solicitado.");
    } finally {
      setStepLoading(false);
    }
  };

  if (!world) {
    return (
      <main className="loading-screen" aria-live="polite">
        <div className="logo-slot">LOGO</div>
        <h1>{error ? "Backend no disponible" : "Inicializando centro de operaciones"}</h1>
        <p>{error || "Sincronizando estado del mundo…"}</p>
        <button className="button button--primary" type="button" onClick={refresh}>Reintentar conexión</button>
        {mode === "api" && (
          <button className="button button--secondary" type="button" onClick={() => switchMode("demo")}>
            Volver a DEMO
          </button>
        )}
      </main>
    );
  }

  return (
    <div className="app-shell">
      <Header
        world={world}
        mode={mode}
        connection={connection}
        lastUpdated={lastUpdated}
        paused={paused}
        onTogglePause={() => setPaused((value) => !value)}
        onReset={reset}
        elapsed={elapsed}
      />
      <main className="dashboard">
        <div className="alert-banner" role="status" aria-live="polite">
          <span className="alert-banner__marker">!</span>
          <strong>{mode === "demo" ? "MODO DEMO ACTIVO" : connection === "connected" ? "DATOS DEL BACKEND" : connection === "connecting" ? "CONECTANDO CON EL BACKEND" : "SIN CONEXIÓN"}</strong>
          <span>{mode === "demo"
            ? "Las posiciones y eventos mostrados son ficticios para demostración."
            : stale
              ? "Los últimos datos válidos están desactualizados."
              : error || `Última actualización: ${lastUpdated?.toLocaleTimeString("es-EC") || "pendiente"}.`}</span>
        </div>
        <div className="dashboard-actions">
          <SimulationControls
            mode={mode}
            onModeChange={switchMode}
            paused={paused}
            onTogglePause={() => setPaused((value) => !value)}
            onReset={reset}
            onRefresh={refresh}
            onLoadScenario={handleLoadScenario}
            scenarioLoading={scenarioLoading}
            onAdvanceTurn={handleAdvanceTurn}
            turnLoading={turnLoading}
            connection={connection}
            localBlocksActive={mode === "api" && validApiBlockOverrides.length > 0}
          />
          <button className="button button--guide" type="button" onClick={() => setGuideOpen(true)}>Guía de supervivencia</button>
        </div>
        <StatsPanel world={activeWorld} />
        <div className="workspace">
          <MantaMap
            world={displayWorld}
            selectedId={selectedId}
            onSelect={setSelectedId}
            mode={mode}
            connection={connection}
            lastUpdated={lastUpdated}
            stale={stale}
            onRefreshMap={refreshMap}
            routeLookup={visibleRouteLookup}
            onSetStreetBlocked={handleSetStreetBlocked}
            onResetLocalBlocks={handleResetApiLocalBlocks}
            localBlocksActive={mode === "api" && validApiBlockOverrides.length > 0}
          />
          <aside className="side-column">
            <RoutePanel world={displayWorld} selectedId={selectedId} onSelect={setSelectedId} mode={mode} routeLookup={visibleRouteLookup} />
            <EventLog events={activeWorld.eventos} scheduledEvents={activeWorld.eventosProgramados} world={activeWorld} />
          </aside>
        </div>
        {(selectedRoute || (mode === "api" && selectedSurvivor)) && (
          <div className="route-detail" aria-label="Detalle del sobreviviente seleccionado">
            <span>DETALLE DEL SOBREVIVIENTE</span>
            <strong>{displayEntityName(displayNames, "survivors", selectedId, "Sobreviviente")}</strong>
            <span>INTERSECCIÓN ACTUAL <b>{selectedNode ? intersectionDisplayName(selectedNode, activeWorld.calles) : "Ubicación no disponible"}</b></span>
            <span>DESTINO <b>{displayEntityName(displayNames, "shelters", selectedSurvivor?.refugioId, "Refugio")}</b></span>
            <span>RUTA <b>{selectedRoute ? `${selectedRoute.nodes?.length ?? selectedRoute.nodos?.length ?? 0} intersecciones` : "Sin ruta publicada actualmente"}</b></span>
            <span>ESTADO <b>{selectedRoute?.status?.toUpperCase() || (selectedSurvivor?.activo ? "ACTIVO" : "INACTIVO")}</b></span>
            {selectedRoute?.updatedAt && <span>ACTUALIZADA <b>{selectedRoute.updatedAt}</b></span>}
            {mode === "api" && (
              <button
                className="button button--secondary"
                type="button"
                onClick={handleAdvanceSelectedSurvivor}
                disabled={!selectedSurvivor?.activo || stepLoading || connection !== "connected"}
              >
                {stepLoading ? "Solicitando…" : "Avanzar un paso"}
              </button>
            )}
            {stepFeedback && <span role="status" aria-live="polite">{stepFeedback}</span>}
          </div>
        )}
      </main>
      {guideOpen && <SurvivalGuide mode={mode} onClose={() => setGuideOpen(false)} />}
    </div>
  );
}
