import { useEffect, useMemo, useState } from "react";
import Header from "./components/Header";
import StatsPanel from "./components/StatsPanel";
import SimulationControls from "./components/SimulationControls";
import MantaMap from "./components/MantaMap";
import RoutePanel from "./components/RoutePanel";
import EventLog from "./components/EventLog";
import SurvivalGuide from "./components/SurvivalGuide";
import { useWorldState } from "./hooks/useWorldState";
import { moveSurvivor, requestNextStep } from "./services/simulatorApi";
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
  const { world, connection, error, lastUpdated, reset, refresh, refreshMap, loadScenario, pollInterval } =
    useWorldState({ demo: mode === "demo", paused });
  const [elapsed, setElapsed] = useState("00:00");
  const [guideOpen, setGuideOpen] = useState(false);
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [stepLoading, setStepLoading] = useState(false);
  const [stepFeedback, setStepFeedback] = useState("");
  const stale = mode === "api" && lastUpdated && Date.now() - lastUpdated.getTime() > pollInterval * 3;

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
    setMode(nextMode);
  };

  useEffect(() => {
    const survivors = world?.sobrevivientes ?? [];
    const routes = world?.rutas ?? [];
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
  }, [world, selectedId]);

  const selectedRoute = useMemo(
    () => world?.rutas?.find(
      (route) => String(route.survivorId ?? route.sobrevivienteId ?? "") === selectedId,
    ),
    [world, selectedId],
  );
  const displayNames = createDisplayNames(world);
  const selectedSurvivor = world?.sobrevivientes?.find(
    (item) => String(item.id) === String(selectedId),
  );
  const selectedNode = world?.nodos?.find(
    (node) => String(node.id) === String(selectedSurvivor?.nodo),
  );

  const handleLoadScenario = async (scenario) => {
    setScenarioLoading(true);
    setStepFeedback("");
    try {
      await loadScenario(scenario);
    } finally {
      setScenarioLoading(false);
    }
  };

  const handleAdvanceSelectedSurvivor = async () => {
    if (mode !== "api" || !selectedSurvivor?.activo || stepLoading) return;
    setStepLoading(true);
    setStepFeedback("");
    try {
      const response = await requestNextStep({
        sobrevivienteId: String(selectedSurvivor.id),
        nodoActual: String(selectedSurvivor.nodo),
        turno: Number(world.turno) || 0,
      });
      const destination = response?.siguienteNodo == null ? "" : String(response.siguienteNodo);
      if (!destination || destination === String(selectedSurvivor.nodo)) {
        setStepFeedback("El backend no indicó un siguiente paso seguro para este sobreviviente.");
        return;
      }

      const nodeExists = world.nodos?.some((node) => String(node.id) === destination);
      const connected = world.calles?.some((street) =>
        (String(street.origen) === String(selectedSurvivor.nodo) && String(street.destino) === destination) ||
        (String(street.destino) === String(selectedSurvivor.nodo) && String(street.origen) === destination),
      );
      const blocked = world.aristasBloqueadas?.some((edge) =>
        Array.isArray(edge) && edge.length >= 2 &&
        ((String(edge[0]) === String(selectedSurvivor.nodo) && String(edge[1]) === destination) ||
          (String(edge[1]) === String(selectedSurvivor.nodo) && String(edge[0]) === destination)),
      );
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
          />
          <button className="button button--guide" type="button" onClick={() => setGuideOpen(true)}>Guía de supervivencia</button>
        </div>
        <StatsPanel world={world} />
        <div className="workspace">
          <MantaMap
            world={world}
            selectedId={selectedId}
            onSelect={setSelectedId}
            mode={mode}
            connection={connection}
            lastUpdated={lastUpdated}
            stale={stale}
            onRefreshMap={refreshMap}
          />
          <aside className="side-column">
            <RoutePanel world={world} selectedId={selectedId} onSelect={setSelectedId} mode={mode} />
            <EventLog events={world.eventos} world={world} />
          </aside>
        </div>
        {(selectedRoute || (mode === "api" && selectedSurvivor)) && (
          <div className="route-detail" aria-label="Detalle del sobreviviente seleccionado">
            <span>DETALLE DEL SOBREVIVIENTE</span>
            <strong>{displayEntityName(displayNames, "survivors", selectedId, "Sobreviviente")}</strong>
            <span>INTERSECCIÓN ACTUAL <b>{selectedNode ? intersectionDisplayName(selectedNode, world.calles) : "Ubicación no disponible"}</b></span>
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
