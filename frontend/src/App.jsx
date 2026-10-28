import { useEffect, useMemo, useRef, useState } from "react";
import EventLog from "./components/EventLog";
import Header from "./components/Header";
import MantaMap from "./components/MantaMap";
import ProFeaturesPanel from "./components/ProFeaturesPanel";
import RoutePanel from "./components/RoutePanel";
import SimulationControls from "./components/SimulationControls";
import StatsPanel from "./components/StatsPanel";
import SurvivalGuide from "./components/SurvivalGuide";
import { useWorldState } from "./hooks/useWorldState";
import {
  applyBlockOverrides,
  directedEdgeKey,
  hasDirectedConnection,
  isDirectedEdgeBlocked,
  recalculateWorldRoutes,
  updateBlockOverrides,
} from "./services/roadRouting.js";
import {
  fetchSurvivorRoute,
  moveSurvivor,
  requestNextStep,
  dispatchVehicle,
} from "./services/simulatorApi";
import {
  createDisplayNames,
  displayEntityName,
  intersectionDisplayName,
} from "./utils/presentation";

function routeStatusLabel(route, lookupStatus) {
  if (!route) {
    return lookupStatus === "loading" ? "Consultando ruta" : "Ruta no disponible";
  }
  const status = String(route.status ?? "").toLowerCase().replaceAll("_", "-");
  if (["sin-ruta", "unavailable", "invalid", "invalida", "blocked", "bloqueada"].includes(status)) {
    return status === "blocked" || status === "bloqueada"
      ? "Ruta bloqueada"
      : "Ruta no disponible";
  }
  if (["alternative", "alternativa"].includes(status)) return "Ruta alternativa";
  if (["active", "activa", "safe", "segura"].includes(status)) return "Ruta activa";
  return "Ruta publicada";
}

function survivorReachedDestination(survivor, refuges = []) {
  const destinationId = survivor?.refugioId ?? survivor?.refugeId;
  if (destinationId == null || survivor?.nodo == null) return false;
  const refuge = refuges.find(
    (item) => String(item.id ?? item.refugioId) === String(destinationId),
  );
  const refugeNode = refuge?.nodo ?? refuge?.node;
  return refugeNode != null && String(survivor.nodo) === String(refugeNode);
}

function readableSurvivorStatus(survivor, refuges) {
  if (!survivor) return "";
  const value = survivor.estado ?? survivor.status ?? survivor.state;
  const normalizedValue = String(value ?? "").trim().toLowerCase().replaceAll("_", " ").replaceAll("-", " ");
  if (/mordid[oa]s? por (?:un )?zomb(?:i|ie)/.test(normalizedValue) || survivor.mordido === true || survivor.mordida === true || survivor.bitten === true) return "Mordido por zombie";
  if (survivorReachedDestination(survivor, refuges)) return "Llegó al refugio";
  if (typeof value === "string" && value.trim()) {
    const status = normalizedValue;
    const labels = {
      active: "Activo",
      activo: "Activo",
      safe: "A salvo",
      "a salvo": "A salvo",
      "at risk": "En riesgo",
      "en peligro": "En riesgo",
      "en riesgo": "En riesgo",
      threatened: "En riesgo",
      peligro: "En riesgo",
      lost: "No sobreviviente",
      inactive: "No sobreviviente",
      inactivo: "No sobreviviente",
      eliminado: "No sobreviviente",
      "mordido por zombie": "Mordido por zombie",
      "mordido por zombi": "Mordido por zombie",
      "mordida por zombie": "Mordido por zombie",
      "mordida por zombi": "Mordido por zombie",
      rescued: "A salvo",
      rescatado: "A salvo",
    };
    if (labels[status]) return labels[status];
    if (
      !/[\d_-]/.test(value) &&
      /\s/.test(value) &&
      !/^[A-Z\s]+$/.test(value)
    ) {
      return value.trim();
    }
  }
  return survivor.activo === true ? "Activo" : survivor.activo === false ? "No sobreviviente" : "";
}

function readableMetric(value) {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value !== "string" || !value.trim()) return "";
  const text = value.trim();
  return /^(?:[A-Z]+[-_]\d+|\d+)$/i.test(text) || /^(undefined|null|nan)$/i.test(text)
    ? ""
    : text;
}

function readableRisk(value) {
  const metric = readableMetric(value);
  if (metric === "") return "";
  if (typeof metric === "number") return metric;
  const labels = {
    low: "Bajo",
    bajo: "Bajo",
    medium: "Medio",
    moderate: "Medio",
    medio: "Medio",
    high: "Alto",
    alto: "Alto",
    severe: "Alto",
    critical: "Crítico",
    critico: "Crítico",
  };
  return labels[metric.toLowerCase()] ?? metric;
}

function SurvivorDetails({
  selectedId,
  survivor,
  name,
  status,
  location,
  destination,
  routeStatus,
  distance,
  risk,
  mode,
  onAdvance,
  stepLoading,
  canAdvance,
  stepFeedback,
}) {
  return (
    <section className="survivor-detail" aria-label="Detalle de la persona seleccionada">
      {selectedId == null ? (
        <p className="survivor-detail__empty">
          Selecciona una persona en el mapa o en la lista de rutas para consultar sus detalles.
        </p>
      ) : !survivor ? (
        <p className="survivor-detail__empty">
          La información de esta persona no está disponible en el estado recibido.
        </p>
      ) : (
        <>
          <div className="survivor-detail__heading">
            <div>
              <span className="survivor-detail__eyebrow">PERSONA SELECCIONADA</span>
              <h2>{name}</h2>
            </div>
            {status && <span className="survivor-detail__status">{status}</span>}
          </div>
          <dl className="survivor-detail__facts">
            {location && <div><dt>Ubicación</dt><dd>{location}</dd></div>}
            {destination && <div><dt>Refugio de destino</dt><dd>{destination}</dd></div>}
            {routeStatus && <div><dt>Estado de la ruta</dt><dd>{routeStatus}</dd></div>}
            {distance != null && distance !== "" && (
              <div>
                <dt>Distancia restante</dt>
                <dd>{typeof distance === "number" ? `${Math.round(distance)} m` : distance}</dd>
              </div>
            )}
            {risk != null && risk !== "" && <div><dt>Nivel de riesgo</dt><dd>{risk}</dd></div>}
          </dl>
          {mode === "api" && (
            <div className="survivor-detail__actions">
              <button
                className="button button--secondary"
                type="button"
                onClick={onAdvance}
                disabled={!canAdvance || stepLoading}
              >
                {stepLoading ? "Solicitando…" : "Avanzar un paso"}
              </button>
              {stepFeedback && <span role="status" aria-live="polite">{stepFeedback}</span>}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default function App() {
  const [mode, setMode] = useState(
    import.meta.env.VITE_DATA_MODE === "api" ? "api" : "demo",
  );
  const [paused, setPaused] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [startedAt] = useState(Date.now());
  const {
    world,
    connection,
    error,
    lastUpdated,
    reset,
    refresh,
    refreshMap,
    loadScenario,
    advanceTurn,
    setDemoBlockedEdge,
    pollInterval,
  } = useWorldState({ demo: mode === "demo", paused });
  const [elapsed, setElapsed] = useState("00:00");
  const [guideOpen, setGuideOpen] = useState(false);
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [turnLoading, setTurnLoading] = useState(false);
  const [stepLoading, setStepLoading] = useState(false);
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [dispatchFeedback, setDispatchFeedback] = useState("");
  const [stepFeedback, setStepFeedback] = useState("");
  const [routeLookup, setRouteLookup] = useState({
    key: "",
    status: "idle",
    route: null,
    error: "",
  });
  const routeRequests = useRef(new Map());
  const [apiBlockOverrides, setApiBlockOverrides] = useState([]);
  const [apiLocalRouting, setApiLocalRouting] = useState(false);
  const stale =
    mode === "api" &&
    lastUpdated &&
    Date.now() - lastUpdated.getTime() > pollInterval * 3;
  const validApiBlockOverrides = useMemo(
    () =>
      (apiBlockOverrides ?? []).filter((edge) =>
        hasDirectedConnection(world, edge.origen, edge.destino),
      ),
    [world?.nodos, world?.calles, apiBlockOverrides],
  );
  const invalidApiOverrideCount =
    apiBlockOverrides.length - validApiBlockOverrides.length;
  const activeWorld = useMemo(() => {
    if (mode !== "api" || !world || !apiLocalRouting) return world;
    const blockedEdges = applyBlockOverrides(
      world.aristasBloqueadas,
      validApiBlockOverrides,
    );
    const recalculated = recalculateWorldRoutes(
      { ...world, aristasBloqueadas: blockedEdges },
      blockedEdges,
    );
    return {
      ...recalculated,
      bloqueosLocalesActivos: true,
      rutasCalculadasLocalmente: true,
      advertenciasBloqueosLocales: invalidApiOverrideCount
        ? [
            `${invalidApiOverrideCount} bloqueo(s) local(es) omitidos porque ya no existen en el mapa actual.`,
          ]
        : [],
    };
  }, [
    mode,
    world,
    apiLocalRouting,
    validApiBlockOverrides,
    invalidApiOverrideCount,
  ]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      setElapsed(
        `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`,
      );
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
    const survivorIds = new Set(
      survivors.map((survivor) => String(survivor.id)),
    );
    const routeIds = routes
      .map((route) => route.survivorId ?? route.sobrevivienteId)
      .filter((id) => id != null)
      .map(String);
    const validIds = mode === "api"
      ? survivorIds
      : new Set([...survivorIds, ...routeIds]);
    if (selectedId != null && validIds.has(String(selectedId))) return;

    const routeForSurvivor = routes.find((route) => {
      const id = route.survivorId ?? route.sobrevivienteId;
      return id != null && survivorIds.has(String(id));
    });
    const routeId =
      routeForSurvivor?.survivorId ?? routeForSurvivor?.sobrevivienteId;
    const nextId =
      routeId ??
      survivors.find((survivor) => survivor.activo !== false)?.id ??
      survivors[0]?.id ??
      (mode === "demo" ? routeIds[0] : null) ??
      null;
    setSelectedId(nextId == null ? null : String(nextId));
  }, [activeWorld, selectedId, mode]);

  const routeFromState = useMemo(
    () =>
      activeWorld?.rutas?.find(
        (route) =>
          String(route.survivorId ?? route.sobrevivienteId ?? "") ===
          selectedId,
      ),
    [activeWorld, selectedId],
  );
  const displayNames = useMemo(
    () => createDisplayNames(activeWorld),
    [activeWorld?.zombies, activeWorld?.sobrevivientes, activeWorld?.refugios],
  );
  const selectedSurvivor = useMemo(
    () =>
      activeWorld?.sobrevivientes?.find(
        (item) => String(item.id) === String(selectedId),
      ),
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
  }, [
    activeWorld?.turno,
    activeWorld?.zombies,
    activeWorld?.aristasBloqueadas,
    selectedSurvivor,
  ]);
  useEffect(() => {
    let current = true;
    if (mode !== "api" || !selectedSurvivor || !routeStateKey) {
      setRouteLookup({
        key: routeStateKey,
        status: "idle",
        route: null,
        error: "",
      });
      return () => {
        current = false;
      };
    }
    if (routeFromState) {
      setRouteLookup({
        key: routeStateKey,
        status: "available",
        route: routeFromState,
        error: "",
      });
      return () => {
        current = false;
      };
    }

    const requestKey = JSON.stringify([selectedSurvivor.id, routeStateKey]);
    const cached = routeRequests.current.get(requestKey);
    if (cached) {
      if (cached.promise) {
        setRouteLookup({ key: routeStateKey, status: "loading", route: null, error: "" });
        cached.promise.then((result) => {
          if (current) setRouteLookup({ key: routeStateKey, ...result });
        });
      } else {
        setRouteLookup({ key: routeStateKey, ...cached });
      }
      return () => {
        current = false;
      };
    }

    setRouteLookup({
      key: routeStateKey,
      status: "loading",
      route: null,
      error: "",
    });
    const request = fetchSurvivorRoute(selectedSurvivor.id)
      .then((route) => ({
        status: route ? "available" : "unavailable",
        route,
        error: "",
      }))
      .catch((routeError) => {
        const error = routeError.status === 401
          ? "unauthorized"
          : routeError.status >= 500
            ? "server"
            : routeError.status
              ? "http"
              : "network";
        console.error("No se pudo consultar la ruta.", routeError);
        return { status: "error", route: null, error };
      });
    routeRequests.current.set(requestKey, {
      status: "loading",
      route: null,
      error: "",
      promise: request,
    });
    request.then((result) => {
        routeRequests.current.set(requestKey, result);
        if (routeRequests.current.size > 100) {
          routeRequests.current.delete(routeRequests.current.keys().next().value);
        }
        if (!current) return;
        setRouteLookup({ key: routeStateKey, ...result });
      });
    return () => {
      current = false;
    };
  }, [mode, selectedId, selectedSurvivor?.id, routeStateKey, routeFromState]);
  const selectedRoute =
    routeFromState ??
    (routeLookup.key === routeStateKey ? routeLookup.route : null);
  const displayWorld = useMemo(() => {
    if (!activeWorld || !selectedRoute) return activeWorld;
    const routes = activeWorld.rutas ?? [];
    const routeId = String(
      selectedRoute.survivorId ?? selectedRoute.sobrevivienteId ?? "",
    );
    if (
      routes.some(
        (route) =>
          String(route.survivorId ?? route.sobrevivienteId ?? "") === routeId,
      )
    ) {
      return activeWorld;
    }
    return { ...activeWorld, rutas: [...routes, selectedRoute] };
  }, [activeWorld, selectedRoute]);
  const visibleRouteLookup =
    routeLookup.key === routeStateKey ? routeLookup : null;
  const selectedNode = useMemo(
    () =>
      activeWorld?.nodos?.find(
        (node) => String(node.id) === String(selectedSurvivor?.nodo),
      ),
    [activeWorld?.nodos, selectedSurvivor?.nodo],
  );
  const survivorArrived = survivorReachedDestination(
    selectedSurvivor,
    activeWorld?.refugios,
  );
  const survivorStatus = readableSurvivorStatus(
    selectedSurvivor,
    activeWorld?.refugios,
  );
  const routeDistance = readableMetric(
    selectedRoute?.distanciaRestante_m ??
      selectedRoute?.distanciaRestante ??
      selectedRoute?.remainingDistanceMeters ??
      selectedRoute?.remainingDistance,
  );
  const riskLevel = readableRisk(
    selectedSurvivor?.nivelRiesgo ??
      selectedSurvivor?.riesgo ??
      selectedSurvivor?.riskLevel ??
      selectedRoute?.nivelRiesgo ??
      selectedRoute?.riskLevel,
  );

  const handleSetStreetBlocked = (origin, destination, blocked) => {
    if (mode === "demo") {
      const result = setDemoBlockedEdge(origin, destination, blocked);
      setStepFeedback(result.message);
      return result;
    }
    if (!world)
      return { ok: false, message: "El mapa todavía no está disponible." };
    const result = updateBlockOverrides(
      world,
      apiBlockOverrides,
      origin,
      destination,
      blocked,
    );
    if (!result.ok) {
      return {
        ok: false,
        message:
          "La conexión seleccionada ya no existe en el mapa recibido.",
      };
    }
    setApiBlockOverrides(result.overrides);
    setApiLocalRouting(true);
    const message = result.changed
      ? `Bloqueo local ${blocked ? "aplicado" : "quitado"}; rutas recalculadas.`
      : "La conexion ya tenia ese estado.";
    setStepFeedback(message);
    return { ...result, message };
  };

  const handleResetApiLocalBlocks = () => {
    setApiBlockOverrides([]);
    setApiLocalRouting(false);
    setStepFeedback("Se quitaron los cambios de prueba locales.");
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
      setStepFeedback(
        "Quita o reinicia los bloqueos locales antes de avanzar el turno.",
      );
      return;
    }
    setTurnLoading(true);
    setStepFeedback("");
    try {
      const updated = await advanceTurn();
      setStepFeedback(
        updated
          ? "Turno avanzado; estado, rutas y eventos actualizados."
          : "No se pudo avanzar el turno. Revisa el estado de conexión y vuelve a intentarlo.",
      );
    } finally {
      setTurnLoading(false);
    }
  };

  const handleAdvanceSelectedSurvivor = async () => {
    if (mode !== "api" || !selectedSurvivor?.activo || stepLoading) return;
    if (validApiBlockOverrides.length > 0) {
      setStepFeedback(
        "Quita o reinicia los bloqueos locales antes de mover al sobreviviente.",
      );
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
      const destination =
        response?.siguienteNodo == null ? "" : String(response.siguienteNodo);
      if (!destination || destination === String(selectedSurvivor.nodo)) {
        setStepFeedback(
          "No hay un siguiente paso seguro para este sobreviviente.",
        );
        return;
      }

      const nodeExists = activeWorld.nodos?.some(
        (node) => String(node.id) === destination,
      );
      const connected = activeWorld.calles?.some(
        (street) =>
          String(street.origen) === String(selectedSurvivor.nodo) &&
          String(street.destino) === destination,
      );
      const blocked = isDirectedEdgeBlocked(
        activeWorld.aristasBloqueadas,
        selectedSurvivor.nodo,
        destination,
      );
      if (!nodeExists || !connected || blocked) {
        setStepFeedback(
          "El siguiente paso no coincide con una conexión del mapa. No se realizó el movimiento.",
        );
        return;
      }

      const result = await moveSurvivor({
        sobrevivienteId: String(selectedSurvivor.id),
        nodoDestino: destination,
      });
      if (result?.movido !== true) {
        setStepFeedback(
          "No se pudo realizar el movimiento. Actualiza los datos e inténtalo de nuevo.",
        );
        await refresh();
        return;
      }
      setStepFeedback("Movimiento confirmado.");
      await refresh();
    } catch (stepError) {
      console.error("No se pudo completar el movimiento.", stepError);
      setStepFeedback(
        "No se pudo completar el movimiento. Inténtalo de nuevo.",
      );
    } finally {
      setStepLoading(false);
    }
  };

  const handleDispatchVehicle = async (vehiculoId, sobrevivienteId) => {
    if (mode !== "api" || dispatchLoading) return;
    setDispatchLoading(true);
    setDispatchFeedback("");
    try {
      const result = await dispatchVehicle({ vehiculoId, sobrevivienteId });
      if (result?.despachado !== true) throw new Error("El servidor rechazó el despacho.");
      setDispatchFeedback("Vehículo despachado; se actualizará el estado del rescate.");
      await refresh();
    } catch (dispatchError) {
      setDispatchFeedback(dispatchError.message || "No se pudo despachar el vehículo.");
    } finally {
      setDispatchLoading(false);
    }
  };

  if (!world) {
    return (
      <main className="loading-screen" aria-live="polite">
        <div className="logo-slot">LOGO</div>
        <h1>
          {error
            ? "No se pudo conectar"
            : "Inicializando centro de operaciones"}
        </h1>
        <p>
          {error
            ? "No se pudo conectar con el sistema. Comprueba la conexión e inténtalo de nuevo."
            : "Sincronizando el estado de la ciudad…"}
        </p>
        <button
          className="button button--primary"
          type="button"
          onClick={refresh}
        >
          Reintentar conexión
        </button>
        {mode === "api" && (
          <button
            className="button button--secondary"
            type="button"
            onClick={() => switchMode("demo")}
          >
            Volver a demostración
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
          <strong>
            {mode === "demo"
              ? "DEMOSTRACIÓN ACTIVA"
              : connection === "connected"
                ? "DATOS EN VIVO"
                : connection === "connecting"
                  ? "CONECTANDO CON EL SISTEMA"
                  : "SIN CONEXIÓN"}
          </strong>
          <span>
            {mode === "demo"
              ? "Las posiciones y eventos mostrados son ficticios para demostración."
              : stale
                ? "Los últimos datos válidos están desactualizados."
                : error
                  ? "No se pudo actualizar la información. Comprueba la conexión."
                  : `Última actualización: ${lastUpdated?.toLocaleTimeString("es-EC") || "pendiente"}.`}
          </span>
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
            localBlocksActive={
              mode === "api" && validApiBlockOverrides.length > 0
            }
          />
          <button
            className="button button--guide"
            type="button"
            onClick={() => setGuideOpen(true)}
          >
            Guía de supervivencia
          </button>
        </div>
        <StatsPanel world={activeWorld} />
        <ProFeaturesPanel world={activeWorld} mode={mode} onDispatch={handleDispatchVehicle} dispatchLoading={dispatchLoading} dispatchFeedback={dispatchFeedback} />
        <div className="workspace">
          <div className="map-column">
            <SurvivorDetails
              selectedId={selectedId}
              survivor={selectedSurvivor}
              name={displayEntityName(
                displayNames,
                "survivors",
                selectedId,
                "Superviviente",
              )}
              status={survivorStatus}
              location={
                selectedNode
                  ? intersectionDisplayName(selectedNode, activeWorld.calles)
                  : ""
              }
              destination={
                selectedSurvivor?.refugioId != null
                  ? displayEntityName(
                      displayNames,
                      "shelters",
                      selectedSurvivor.refugioId,
                      "Refugio",
                    )
                  : ""
              }
              routeStatus={
                selectedId != null
                  ? survivorArrived
                    ? "Ruta completada"
                    : routeStatusLabel(selectedRoute, visibleRouteLookup?.status)
                  : ""
              }
              distance={routeDistance}
              risk={riskLevel}
              mode={mode}
              onAdvance={handleAdvanceSelectedSurvivor}
              stepLoading={stepLoading}
              canAdvance={
                selectedSurvivor?.activo === true && connection === "connected"
              }
              stepFeedback={stepFeedback}
            />
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
            localBlocksActive={
              mode === "api" && validApiBlockOverrides.length > 0
            }
          />
          </div>
          <aside className="side-column">
            <RoutePanel
              world={displayWorld}
              selectedId={selectedId}
              onSelect={setSelectedId}
              mode={mode}
              routeLookup={visibleRouteLookup}
            />
            <EventLog
              events={activeWorld.eventos}
              scheduledEvents={activeWorld.eventosProgramados}
              world={activeWorld}
            />
          </aside>
        </div>
      </main>
      {guideOpen && (
        <SurvivalGuide mode={mode} onClose={() => setGuideOpen(false)} />
      )}
    </div>
  );
}
