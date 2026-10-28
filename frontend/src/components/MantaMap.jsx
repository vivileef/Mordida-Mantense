import { divIcon } from "leaflet";
import { Fragment, memo, useEffect, useMemo, useRef, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import { center } from "../data/demoWorld";
import localRoadNetwork from "../data/mantaRoadNetwork.json";
import {
  resolveRoadMap,
  routeGeometry,
  streetGeometry,
  uniqueStreetPaths,
} from "../services/geo";
import { directedEdgeKey, isDirectedEdgeBlocked } from "../services/roadRouting.js";
import {
  createDisplayNames,
  displayEntityName,
  intersectionDisplayName,
  shouldDisplayZombie,
  streetDisplayName,
} from "../utils/presentation";

const labels = {
  caminante: "Caminante",
  walker: "Caminante",
  corredor: "Corredor",
  runner: "Runner",
  horda: "Horda",
  horde: "Horde",
  dormido: "Dormido",
  dormant: "Dormido",
};
const iconShapes = {
  survivor:
    '<circle cx="16" cy="8" r="3.5"/><path d="M10 24c.4-5 2.4-8 6-8s5.6 3 6 8M12 19h8M16 16v8"/>',
  walker:
    '<ellipse cx="11" cy="20" rx="3" ry="5" transform="rotate(-25 11 20)"/><ellipse cx="21" cy="12" rx="3" ry="5" transform="rotate(-25 21 12)"/>',
  runner: '<path d="m18 4 5 5-5 1 1 5-9 9 2-7-6-2 7-5z"/>',
  horde:
    '<path d="M8 9c0-4 3-6 8-6s8 2 8 6v8c0 5-3 7-8 7s-8-2-8-7z"/><circle cx="13" cy="13" r="1.5"/><circle cx="19" cy="13" r="1.5"/><path d="M12 19c2 2 4 2 8 0M16 16v3"/>',
  dormant:
    '<path d="M22 4a9 9 0 1 0 2 17A10 10 0 0 1 22 4Z"/><path d="M10 8h3M8 12h3"/>',
  shelter: '<path d="m4 14 12-9 12 9v11H4z"/><path d="M12 25v-7h8v7M8 14h16"/>',
  blocked: '<path d="M5 8h22M5 16h22M5 24h22M9 5v22M23 5v22"/>',
};
const iconColors = {
  survivor: "#22E58B",
  walker: "#FF9F1C",
  runner: "#FF9F1C",
  horde: "#8B5CF6",
  dormant: "#F5C542",
  shelter: "#22E58B",
  blocked: "#FF9F1C",
};
function markerKind(type) {
  const normalized = String(type || "").toLowerCase();
  if (normalized === "caminante" || normalized === "walker") return "walker";
  if (normalized === "corredor" || normalized === "runner") return "runner";
  if (normalized === "horda" || normalized === "horde") return "horde";
  if (normalized === "dormido" || normalized === "dormant") return "dormant";
  return "walker";
}
function entityIcon(kind, label) {
  const color = iconColors[kind];
  return divIcon({
    className: "entity-icon-wrapper",
    html: `<span class="entity-icon entity-icon--${kind}" style="--marker-color:${color}" role="img" aria-label="${label}"><svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">${iconShapes[kind]}</svg></span>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
  });
}

function survivorIcon({ label = "Sobreviviente", selected = false, active = true } = {}) {
  const accent = active ? "#22E58B" : "#8A9490";
  const ring = selected ? "#F5C542" : accent;
  return divIcon({
    className: `survivor-marker${selected ? " survivor-marker--selected" : ""}${active ? "" : " survivor-marker--inactive"}`,
    html: `
      <div class="survivor-marker__body">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="56"
          height="70"
          viewBox="0 0 48 64"
          role="img"
          aria-label="${label}"
          style="display:block"
        >
          <ellipse cx="24" cy="60" rx="14" ry="3.5" fill="#000" opacity=".35"/>
          <circle cx="24" cy="13" r="9" fill="#F2C6A0" stroke="#182124" stroke-width="2"/>
          <path d="M15 12 Q15 2 24 2 Q34 2 33 12 L29 8 L20 8 Z" fill="#303B38"/>
          <path d="M18 14h2M28 14h2" stroke="#182124" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M17 23 L31 23 L35 43 L29 44 L28 34 L28 49 L20 49 L20 34 L19 44 L13 43 Z"
            fill="${accent}" stroke="#182124" stroke-width="2" stroke-linejoin="round"/>
          <path d="M31 25 L37 34 L34 38 L28 30" fill="none" stroke="#F2C6A0" stroke-width="5" stroke-linecap="round"/>
          <path d="M17 25 L10 37 L14 40 L22 30" fill="none" stroke="#F2C6A0" stroke-width="5" stroke-linecap="round"/>
          <path d="M20 48 L19 57 M28 48 L30 57" fill="none" stroke="#27312F" stroke-width="6" stroke-linecap="round"/>
          <path d="M13 58h7M29 58h8" stroke="#E4863A" stroke-width="5" stroke-linecap="round"/>
          <path d="M28 27v10" stroke="#D8F4DE" stroke-width="2" opacity=".8"/>
          <circle cx="24" cy="13" r="13" fill="none" stroke="${ring}" stroke-width="${selected ? 2 : 1}" opacity="${selected ? 1 : .45}"/>
        </svg>
      </div>
    `,
    iconSize: [56, 70],
    iconAnchor: [28, 60],
    popupAnchor: [0, -56],
  });
}

function RecenterMap() {
  const map = useMap();
  return (
    <button
      className="map-recenter"
      type="button"
      onClick={() => map.setView(center, 14)}
    >
      Centrar Manta
    </button>
  );
}
function FitWorld({ positions }) {
  const map = useMap();
  const hasFittedWorld = useRef(false);

  useEffect(() => {
    if (!hasFittedWorld.current && positions.length > 1) {
      map.fitBounds(positions, { padding: [24, 24], maxZoom: 15 });
      hasFittedWorld.current = true;
    }
  }, [map, positions]);

  return null;
}
function coordinates(world) {
  return new Map(
    (world?.nodos || []).map((node) => [node.id, [node.lat, node.lng]]),
  );
}
function middleOf(path) {
  if (path.length < 2) return path[0];
  return [(path[0][0] + path[1][0]) / 2, (path[0][1] + path[1][1]) / 2];
}

function samePath(first, second) {
  return first.length === second.length && first.length > 1 && first.every(([lat, lng], index) =>
    Math.abs(lat - second[index][0]) <= 1e-7 &&
    Math.abs(lng - second[index][1]) <= 1e-7,
  );
}

function streetSelectionKey(street, path) {
  return `${directedEdgeKey(street.origen, street.destino)}|${JSON.stringify(path)}`;
}

function directionsForStreet(street, path, streetMap, nodeMap) {
  const reverse = (streetMap.get(`${street.destino}|${street.origen}`) ?? []).find((candidate) =>
    samePath(streetGeometry(candidate, nodeMap), [...path].reverse()),
  );
  return reverse ? [street, reverse] : [street];
}

function AnimatedMarker({ position, duration = 2000, ...markerProps }) {
  const [displayPosition, setDisplayPosition] = useState(position);
  const currentPosition = useRef(position);

  useEffect(() => {
    if (!position) return;

    const start = [...currentPosition.current];
    const end = [...position];
    const distance = Math.max(
      Math.abs(end[0] - start[0]),
      Math.abs(end[1] - start[1]),
    );

    if (distance < 0.000001) {
      currentPosition.current = end;
      setDisplayPosition(end);
      return;
    }

    let frame;
    let startTime;

    const animate = (timestamp) => {
      if (startTime === undefined) startTime = timestamp;

      const progress = Math.min((timestamp - startTime) / duration, 1);

      // Suaviza el inicio y el final del movimiento.
      const eased = progress * progress * (3 - 2 * progress);

      const nextPosition = [
        start[0] + (end[0] - start[0]) * eased,
        start[1] + (end[1] - start[1]) * eased,
      ];

      currentPosition.current = nextPosition;
      setDisplayPosition(nextPosition);

      if (progress < 1) {
        frame = requestAnimationFrame(animate);
      }
    };

    frame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(frame);
  }, [position[0], position[1], duration]);

  return <Marker {...markerProps} position={displayPosition} />;
}

const MantaMap = memo(function MantaMap({
  world,
  selectedId,
  onSelect,
  mode = "demo",
  connection = "connecting",
  lastUpdated,
  stale = false,
  onRefreshMap,
  routeLookup,
  onSetStreetBlocked,
  onResetLocalBlocks,
  localBlocksActive = false,
}) {
  const [layers, setLayers] = useState({
    streets: true,
    survivors: true,
    zombies: true,
    shelters: true,
    blocked: true,
    routes: true,
    intersections: false,
  });
  const [blockMode, setBlockMode] = useState(false);
  const [selectedStreetKey, setSelectedStreetKey] = useState("");
  const [blockerFeedback, setBlockerFeedback] = useState("");
  useEffect(() => {
    setBlockMode(false);
    setSelectedStreetKey("");
    setBlockerFeedback("");
  }, [mode]);
  const resolvedApiMap = useMemo(
    () =>
      mode === "api"
        ? resolveRoadMap(
            { nodos: world?.nodos ?? [], calles: world?.calles ?? [] },
            localRoadNetwork,
          )
        : null,
    [mode, world?.nodos, world?.calles],
  );
  const mapWorld =
    mode === "api" && resolvedApiMap
      ? { ...world, nodos: resolvedApiMap.nodos, calles: resolvedApiMap.calles }
      : world;
  const roadMapWarnings = resolvedApiMap?.warnings ?? [];
  const displayNames = useMemo(
    () => createDisplayNames(world),
    [world?.zombies, world?.sobrevivientes, world?.refugios],
  );
  const nodeMap = useMemo(() => coordinates(mapWorld), [mapWorld?.nodos]);
  const nodesById = useMemo(
    () =>
      new Map((mapWorld?.nodos || []).map((node) => [String(node.id), node])),
    [mapWorld?.nodos],
  );
  const streetMap = useMemo(
    () =>
      (mapWorld?.calles || []).reduce((groups, street) => {
        const key = `${street.origen}|${street.destino}`;
        const group = groups.get(key) ?? [];
        group.push(street);
        groups.set(key, group);
        return groups;
      }, new Map()),
    [mapWorld?.calles],
  );
  const streetPaths = useMemo(
    () => uniqueStreetPaths(mapWorld?.calles || [], nodeMap),
    [mapWorld?.calles, nodeMap],
  );
  const hasStreetGeometry = streetPaths.length > 0;
  const blockedEdgeSignature = (world?.aristasBloqueadas || [])
    .filter((edge) => Array.isArray(edge) && edge.length >= 2)
    .map((edge) => directedEdgeKey(edge[0], edge[1]))
    .sort()
    .join("\u0000");
  const blockedEdges = useMemo(
    () => new Set(blockedEdgeSignature ? blockedEdgeSignature.split("\u0000") : []),
    [blockedEdgeSignature],
  );
  const renderedStreetPaths = useMemo(() => streetPaths.map((item) => {
    const directions = directionsForStreet(item.street, item.path, streetMap, nodeMap);
    const blockedDirections = directions.filter((street) =>
      blockedEdges.has(directedEdgeKey(street.origen, street.destino)),
    );
    return {
      ...item,
      directions,
      blockedDirections,
      selectionKey: streetSelectionKey(item.street, item.path),
    };
  }), [streetPaths, streetMap, nodeMap, blockedEdges]);
  const selectedStreet = renderedStreetPaths.find((item) => item.selectionKey === selectedStreetKey);
  const selectedDirections = selectedStreet?.directions ?? [];
  const routePaths = useMemo(
    () =>
      (world?.rutas || []).map((route) =>
        routeGeometry(route, nodeMap, streetMap),
      ),
    [world?.rutas, nodeMap, streetMap],
  );
  const hasRouteGeometry = routePaths.some((path) => path.length > 1);
  const mapPositions = useMemo(() => [...nodeMap.values()], [nodeMap]);
  const invalidEntities = useMemo(
    () =>
      [
        ...(world?.zombies || []).map((item) => [
          "zombies",
          item.id,
          item.nodo,
          item.nombreNodo,
        ]),
        ...(world?.sobrevivientes || []).map((item) => [
          "survivors",
          item.id,
          item.nodo,
          item.nombreNodo,
        ]),
        ...(world?.refugios || []).map((item) => [
          "shelters",
          item.id,
          item.nodo ?? item.node,
          item.nombreNodo,
        ]),
      ].filter(([, , node]) => node == null || !nodeMap.has(String(node))),
    [world?.zombies, world?.sobrevivientes, world?.refugios, nodeMap],
  );
  const routeDiagnostics = useMemo(
    () =>
      (world?.rutas || []).flatMap((route) => {
        const routeId =
          route.survivorId ?? route.sobrevivienteId ?? "Ruta sin identificador";
        const routeNodes = Array.isArray(route.nodes ?? route.nodos)
          ? (route.nodes ?? route.nodos)
          : [];
        const routeStreets = Array.isArray(route.streets ?? route.calles)
          ? (route.streets ?? route.calles)
          : [];
        const streetNodeIds = routeStreets.flatMap((street) => [
          street.origen ?? street.origin ?? street.from,
          street.destino ?? street.destination ?? street.to,
        ]);
        const referencedNodes = [...routeNodes, ...streetNodeIds]
          .filter((node) => node != null)
          .map(String);
        const missingNodes = [
          ...new Set(referencedNodes.filter((node) => !nodeMap.has(node))),
        ];
        const missingSegments = [];

        if (missingNodes.length === 0 && routeNodes.length > 1) {
          for (let index = 0; index < routeNodes.length - 1; index += 1) {
            const origin = String(routeNodes[index]);
            const destination = String(routeNodes[index + 1]);
            if (
              !streetMap.has(`${origin}|${destination}`) &&
              !streetMap.has(`${destination}|${origin}`)
            ) {
              missingSegments.push(`${origin} → ${destination}`);
            }
          }
        }

        if (missingNodes.length === 0 && routeNodes.length > 1) {
          for (let index = 0; index < routeNodes.length - 1; index += 1) {
            const origin = String(routeNodes[index]);
            const destination = String(routeNodes[index + 1]);
            const hasConnection =
              streetMap.has(`${origin}|${destination}`) ||
              streetMap.has(`${destination}|${origin}`);
            if (
              hasConnection &&
              routeGeometry(
                {
                  nodes: [origin, destination],
                  streets: routeStreets[index] ? [routeStreets[index]] : [],
                },
                nodeMap,
                streetMap,
              ).length < 2
            ) {
              missingSegments.push(
                `${origin} a ${destination} (sin geometría vial)`,
              );
            }
          }
        }

        return [
          ...(missingNodes.length
            ? [
                {
                  routeId,
                  message: `${missingNodes.length} intersección(es) no están en el mapa`,
                },
              ]
            : []),
          ...(missingSegments.length
            ? [
                {
                  routeId,
                  message: `${missingSegments.length} tramo(s) no tienen una calle compatible`,
                },
              ]
            : []),
        ];
      }),
    [world?.rutas, nodeMap, streetMap],
  );
  const routesWithoutGeometry = (world?.rutas || []).filter((route, index) => {
    const routeNodes = route.nodes ?? route.nodos ?? [];
    return routeNodes.length > 0 && routePaths[index]?.length < 2;
  });
  const routesUnavailable = (world?.rutas || []).filter(
    (route) => route.status === "sin_ruta" || route.status === "unavailable",
  );
  const toggleLayer = (layer) =>
    setLayers((current) => ({ ...current, [layer]: !current[layer] }));
  const selectStreet = (item, event) => {
    setSelectedStreetKey(item.selectionKey);
    setBlockerFeedback("");
    if (blockMode) {
      event?.originalEvent?.preventDefault?.();
      event?.originalEvent?.stopPropagation?.();
    }
  };
  const setStreetBlocked = async (street, blocked) => {
    if (!selectedStreet || !onSetStreetBlocked) {
      setBlockerFeedback("Selecciona una conexion valida del mapa antes de cambiar su estado.");
      return;
    }
    try {
      const result = await onSetStreetBlocked(street.origen, street.destino, blocked);
      setBlockerFeedback(result?.message || (result?.ok ? "Estado de la calle actualizado." : "No se pudo cambiar el estado de la calle."));
    } catch (error) {
      setBlockerFeedback(error.message || "No se pudo cambiar el estado de la calle.");
    }
  };
  const selectedParallelCount = selectedStreet
    ? (streetMap.get(`${selectedStreet.street.origen}|${selectedStreet.street.destino}`) ?? []).length
    : 0;
  return (
    <section className="map-panel">
      <div className="map-label">
        <span className="pulse" /> MAPA TÁCTICO · MANTA{" "}
        <small>
          {mode === "demo"
            ? "POSICIONES DEMO"
            : connection === "connected"
              ? "DATOS DEL SERVIDOR"
              : "DATOS API DESCONECTADOS"}
          {lastUpdated ? ` · ${lastUpdated.toLocaleTimeString("es-EC")}` : ""}
          {stale ? " · DESACTUALIZADOS" : ""}
        </small>
      </div>
      <div className="map-notices" aria-live="polite">
        {localBlocksActive && (
          <div className="map-notice map-notice--error">
            Hay cambios locales de calles y rutas de prueba. No se guardaron en el backend.
            <button className="map-blocker__clear" type="button" onClick={onResetLocalBlocks}>
              Restablecer estado API
            </button>
          </div>
        )}
        {(!hasStreetGeometry ||
          (layers.routes &&
            (world?.rutas?.length ?? 0) > 0 &&
            !hasRouteGeometry &&
            routeDiagnostics.length === 0)) && (
          <div className="map-notice">
            {!hasStreetGeometry
              ? "No hay calles georreferenciadas válidas en los datos recibidos."
              : "No se pudieron trazar una o más rutas con las calles recibidas."}
          </div>
        )}
        {mode === "api" &&
          layers.routes &&
          (world?.rutas?.length ?? 0) === 0 && (
            <div className="map-notice">
              {world?.camposEstadoAusentes?.includes("rutas")
                ? routeLookup?.status === "loading"
                  ? "Consultando la ruta del sobreviviente seleccionado…"
                  : routeLookup?.status === "unavailable"
                    ? "El backend no encontró una ruta segura para el sobreviviente seleccionado."
                    : routeLookup?.status === "error"
                      ? `No se pudo consultar la ruta: ${routeLookup.error}`
                      : "GET /estado no incluye una lista de rutas; se consulta GET /ruta para la persona seleccionada."
                : "No hay rutas publicadas en este estado."}
            </div>
          )}
        {mode === "api" &&
          layers.blocked &&
          (world?.aristasBloqueadas?.length ?? 0) === 0 && (
            <div className="map-notice">
              {world?.camposEstadoAusentes?.includes("aristasBloqueadas")
                ? "GET /estado no incluyó el campo aristasBloqueadas."
                : "No hay calles bloqueadas en este estado."}
            </div>
          )}
        {mode === "api" &&
          world?.camposEstadoAusentes?.includes("refugios") && (
            <div className="map-notice">
              GET /estado no incluye el campo refugios.
            </div>
          )}
        {mode === "api" &&
          world?.camposEstadoAusentes?.includes("sobrevivientes") && (
            <div className="map-notice">
              GET /estado no incluye sobrevivientes; se mostrarán los zombis
              recibidos.
            </div>
          )}
        {invalidEntities.length > 0 && (
          <div className="map-notice map-notice--error">
            Entidades omitidas:{" "}
            {invalidEntities
              .map(([kind, id, , nodeName]) => {
                const label = displayEntityName(
                  displayNames,
                  kind,
                  id,
                  kind === "survivors"
                    ? "Sobreviviente"
                    : kind === "zombies"
                      ? "Zombie"
                      : "Refugio",
                );
                return nodeName ? `${label} (${nodeName})` : label;
              })
              .join("; ")}
            . No se mostraron: el nodo indicado no existe o no está en el mapa
            recibido.
          </div>
        )}
        {roadMapWarnings.length > 0 && (
          <div className="map-notice map-notice--error">
            Compatibilidad de la red API: {roadMapWarnings.join(" ")}
          </div>
        )}
        {routeDiagnostics.length > 0 && (
          <div className="map-notice map-notice--error">
            Rutas incompletas:{" "}
            {routeDiagnostics
              .map(
                ({ routeId, message }) =>
                  `${displayEntityName(displayNames, "survivors", routeId, "Sobreviviente")}: ${message}`,
              )
              .join("; ")}
            .
          </div>
        )}
        {layers.routes &&
          routesWithoutGeometry.length > 0 &&
          routeDiagnostics.length === 0 && (
            <div className="map-notice map-notice--error">
              No hay trazado vial para{" "}
              {routesWithoutGeometry
                .map((route) =>
                  displayEntityName(
                    displayNames,
                    "survivors",
                    route.survivorId ?? route.sobrevivienteId,
                    "un sobreviviente",
                  ),
                )
                .join(", ")}
              . Verifica que sus tramos tengan geometría en el mapa.
            </div>
          )}
        {world?.advertenciasRutasLocales?.map((warning) => (
          <div className="map-notice map-notice--error" key={warning}>{warning}</div>
        ))}
        {world?.advertenciasBloqueosLocales?.map((warning) => (
          <div className="map-notice map-notice--error" key={warning}>{warning}</div>
        ))}
        {routesUnavailable.length > 0 && (
          <div className="map-notice map-notice--error">
            Sin ruta disponible para {routesUnavailable
              .map((route) => displayEntityName(displayNames, "survivors", route.survivorId ?? route.sobrevivienteId, "un sobreviviente"))
              .join(", ")}.
          </div>
        )}
      </div>
      {blockMode && (
        <div className="map-blocker" role="status" aria-live="polite">
          <strong>{mode === "api" ? "Bloqueo local de prueba" : "Modo Bloquear calle"}</strong>
          {selectedStreet ? (
            <>
              <span>{streetDisplayName(selectedStreet.street)}</span>
              {selectedParallelCount > 1 && (
                <small>El modelo identifica bloqueos por par de nodos: se afectaran {selectedParallelCount} conexiones paralelas del sentido elegido.</small>
              )}
              <div className="map-blocker__directions">
                {selectedDirections.map((street) => {
                  const blocked = blockedEdges.has(directedEdgeKey(street.origen, street.destino));
                  return (
                    <button
                      className="button button--secondary"
                      type="button"
                      key={directedEdgeKey(street.origen, street.destino)}
                      onClick={() => setStreetBlocked(street, !blocked)}
                    >
                      {blocked ? "Desbloquear" : "Bloquear"} sentido {street.origen} → {street.destino}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <span>Haz clic en una calle georreferenciada para seleccionar una conexion existente.</span>
          )}
          {mode === "api" && (
            <small>Este escenario es solo local; no modifica ni persiste el estado del backend.</small>
          )}
          {blockerFeedback && <span className="map-blocker__feedback">{blockerFeedback}</span>}
          {selectedStreet && (
            <button className="map-blocker__clear" type="button" onClick={() => setSelectedStreetKey("")}>Quitar seleccion</button>
          )}
        </div>
      )}
      <div className="map-controls" aria-label="Capas del mapa">
        {[
          ["streets", "Calles"],
          ["survivors", "Sobrevivientes"],
          ["zombies", "Zombies"],
          ["shelters", "Refugios"],
          ["routes", "Rutas"],
          ["blocked", "Calles bloqueadas"],
          ["intersections", "Intersecciones"],
        ].map(([layer, label]) => (
          <button
            className={layers[layer] ? "is-visible" : ""}
            key={layer}
            type="button"
            aria-pressed={layers[layer]}
            onClick={() => toggleLayer(layer)}
          >
            {layers[layer] ? "●" : "○"} {label}
          </button>
        ))}
        <button
          className={blockMode ? "is-visible" : ""}
          type="button"
          aria-pressed={blockMode}
          disabled={!hasStreetGeometry}
          title={hasStreetGeometry ? "Selecciona una calle y bloquea un sentido" : "El grafo no contiene geometria vial seleccionable"}
          onClick={() => {
            setBlockMode(!blockMode);
            setSelectedStreetKey("");
            setBlockerFeedback("");
          }}
        >
          {blockMode ? "Salir de bloqueo" : "Bloquear calle"}
        </button>
        {mode === "api" && (
          <button
            type="button"
            onClick={onRefreshMap}
            title="Actualizar el grafo de calles"
          >
            ↻ Mapa
          </button>
        )}
      </div>
      <MapContainer
        center={center}
        zoom={14}
        scrollWheelZoom
        className="leaflet-map"
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <RecenterMap />
        <FitWorld positions={mapPositions} />
        {renderedStreetPaths.map((item) => {
          const { street, path, index, directions, blockedDirections, selectionKey } = item;
          const selected = selectedStreetKey === selectionKey;
          const blocked = blockedDirections.length === directions.length;
          const partiallyBlocked = blockedDirections.length > 0 && !blocked;
          const showOpen = layers.streets;
          const showBlocked = blockedDirections.length > 0 && layers.blocked;
          if (!showOpen && !showBlocked) return null;
          if (!path.length) return null;
          const streetEvents = { click: (event) => selectStreet(item, event) };
          return (
            <Fragment key={`street-${index}`}>
              {showOpen && (
                <Polyline
                  positions={path}
                  pathOptions={{
                    color: selected ? "#54D6DF" : "#3B2A6B",
                    weight: selected ? 6 : 2,
                    opacity: selected ? 1 : 0.75,
                  }}
                  eventHandlers={streetEvents}
                >
                  <Tooltip sticky>{streetDisplayName(street)}</Tooltip>
                  {!blockMode && !partiallyBlocked && <Popup>
                    <b>{streetDisplayName(street)}</b>
                    <br />
                    Tipo: {street.tipo || "calle"}
                    {street.distancia_m ? (
                      <>
                        <br />
                        Distancia: {Math.round(street.distancia_m)} m
                      </>
                    ) : null}
                    <br />
                    {directions.map((direction) => `${direction.origen} -> ${direction.destino}: ${blockedEdges.has(directedEdgeKey(direction.origen, direction.destino)) ? "bloqueada" : "transitable"}`).join("; ")}
                    {selected ? " · seleccionada" : ""}
                  </Popup>}
                </Polyline>
              )}
              {showBlocked && (
                <Polyline
                  positions={path}
                  pathOptions={{
                    color: selected ? "#FF7B00" : "#FF9F1C",
                    weight: selected ? 7 : 5,
                    dashArray: "8 8",
                    opacity: 0.95,
                  }}
                  eventHandlers={streetEvents}
                >
                  <Tooltip sticky>{streetDisplayName(street)} · bloqueada</Tooltip>
                  {!blockMode && <Popup>
                  <b>{streetDisplayName(street)}</b>
                  <br />
                  Tipo: {street.tipo || "calle"}
                  {street.distancia_m ? (
                    <>
                      <br />
                      Distancia: {Math.round(street.distancia_m)} m
                    </>
                  ) : null}
                  <br />
                  {directions.map((direction) => `${direction.origen} -> ${direction.destino}: ${blockedEdges.has(directedEdgeKey(direction.origen, direction.destino)) ? "bloqueada" : "transitable"}`).join("; ")}
                  {selected ? " · seleccionada" : ""}
                  </Popup>}
                </Polyline>
              )}
              {blocked && path.length > 1 && (
                <AnimatedMarker
                  position={middleOf(path)}
                  icon={entityIcon("blocked", "Calle bloqueada")}
                >
                  <Tooltip>Calle bloqueada</Tooltip>
                  <Popup>
                    <b>{streetDisplayName(street)}</b>
                    <br />
                    Calle bloqueada · no disponible
                  </Popup>
                </AnimatedMarker>
              )}
            </Fragment>
          );
        })}
        {layers.routes &&
          (world?.rutas || []).map((route, index) => {
            const path = routePaths[index];
            if (!path.length) return null;
            const recommended =
              route.recomendada === true ||
              route.segura === true ||
              route.tipo === "segura";
            return (
              <Polyline
                key={`route-${route.survivorId}`}
                positions={path}
                pathOptions={{
                  color:
                    route.survivorId === selectedId
                      ? "#8B5CF6"
                      : recommended
                        ? "#FF9F1C"
                        : "#7B2CBF",
                  weight: route.survivorId === selectedId ? 5 : 3,
                  dashArray: route.status === "invalida" ? "5 8" : undefined,
                }}
              />
            );
          })}
        {layers.intersections &&
          (mapWorld?.nodos || []).map((node) => {
            const position = nodeMap.get(node.id);
            if (!position) return null;
            return (
              <CircleMarker
                key={`node-${node.id}`}
                center={position}
                radius={4}
                pathOptions={{
                  color: "#54D6DF",
                  fillColor: "#0E151A",
                  fillOpacity: 1,
                  weight: 2,
                }}
              >
                <Tooltip>
                  {intersectionDisplayName(node, mapWorld?.calles || [])}
                </Tooltip>
                <Popup>
                  <b>{intersectionDisplayName(node, mapWorld?.calles || [])}</b>
                </Popup>
              </CircleMarker>
            );
          })}
        {layers.zombies &&
          (world?.zombies || []).filter(shouldDisplayZombie).map((zombie) => {
            const position = nodeMap.get(String(zombie.nodo));
            if (!position) return null;
            const type = String(zombie.tipo || "").toLowerCase();
            const kind = markerKind(type);
            const isDormant = type === "dormido" || type === "dormant";
            return (
              <Fragment key={zombie.id}>
                <Marker
                  position={position}
                  icon={entityIcon(kind, labels[type] || zombie.tipo)}
                >
                  <Tooltip>
                    {displayEntityName(
                      displayNames,
                      "zombies",
                      zombie.id,
                      "Zombie",
                    )}
                    : {labels[type] || zombie.tipo}
                  </Tooltip>
                  <Popup>
                    <b>
                      {displayEntityName(
                        displayNames,
                        "zombies",
                        zombie.id,
                        "Zombie",
                      )}
                    </b>
                    <br />
                    Tipo: {labels[type] || zombie.tipo}
                    <br />
                    Ubicación:{" "}
                    {zombie.nombreNodo ||
                      intersectionDisplayName(
                        nodesById.get(String(zombie.nodo)),
                        mapWorld?.calles || [],
                      )}
                    {zombie.cantidad ? (
                      <>
                        <br />
                        Grupo: {zombie.cantidad}
                      </>
                    ) : null}
                    <br />
                    Estado:{" "}
                    {zombie.visible === false
                      ? isDormant
                        ? "dormido, no detectado"
                        : "oculto"
                      : isDormant
                        ? "dormido"
                        : "detectado"}
                  </Popup>
                </Marker>
              </Fragment>
            );
          })}
        {layers.survivors &&
          (world?.sobrevivientes || []).map((survivor) => {
            const position = nodeMap.get(String(survivor.nodo));
            if (!position) return null;
            return (
              <Marker
                position={position}
                icon={survivorIcon({
                  label: `Sobreviviente ${survivor.id}`,
                  selected: String(selectedId) === String(survivor.id),
                  active: survivor.activo !== false,
                })}
                key={survivor.id}
                eventHandlers={{ click: () => onSelect(survivor.id) }}
              >
                <Tooltip>
                  {displayEntityName(
                    displayNames,
                    "survivors",
                    survivor.id,
                    "Sobreviviente",
                  )}
                </Tooltip>
                <Popup>
                  <b>
                    {displayEntityName(
                      displayNames,
                      "survivors",
                      survivor.id,
                      "Sobreviviente",
                    )}
                  </b>
                  <br />
                  Tipo: sobreviviente
                  <br />
                  Ubicación:{" "}
                  {intersectionDisplayName(
                    nodesById.get(String(survivor.nodo)),
                    mapWorld?.calles || [],
                  )}
                  <br />
                  Estado: {survivor.activo ? "en camino" : "eliminado"}
                  <br />
                  Destino:{" "}
                  {displayEntityName(
                    displayNames,
                    "shelters",
                    survivor.refugioId,
                    "Refugio",
                  )}
                </Popup>
              </Marker>
            );
          })}
        {layers.shelters &&
          (world?.refugios || []).map((shelter) => {
            const shelterNode = shelter.nodo ?? shelter.node;
            const position = nodeMap.get(String(shelterNode));
            return position ? (
              <Marker
                position={position}
                icon={entityIcon("shelter", "Refugio seguro")}
                key={shelter.id}
              >
                <Tooltip>
                  {displayEntityName(
                    displayNames,
                    "shelters",
                    shelter.id,
                    "Refugio",
                  )}
                </Tooltip>
                <Popup>
                  <b>
                    {displayEntityName(
                      displayNames,
                      "shelters",
                      shelter.id,
                      "Refugio",
                    )}
                  </b>
                  <br />
                  Tipo: refugio seguro
                  <br />
                  Ubicación:{" "}
                  {intersectionDisplayName(
                    nodesById.get(String(shelterNode)),
                    mapWorld?.calles || [],
                  )}
                  <br />
                  Estado: disponible
                  {(shelter.capacidad ?? shelter.capacity) != null ? (
                    <>
                      <br />
                      Capacidad: {shelter.capacidad ?? shelter.capacity}
                    </>
                  ) : null}
                </Popup>
              </Marker>
            ) : null;
          })}
      </MapContainer>
      <div className="map-legend" aria-label="Leyenda de entidades del mapa">
        <span>
          <i
            className="legend-symbol legend-symbol--survivor"
            aria-hidden="true"
          />{" "}
          Sobreviviente
        </span>
        <span>
          <i
            className="legend-symbol legend-symbol--walker"
            aria-hidden="true"
          />{" "}
          Caminante
        </span>
        <span>
          <i
            className="legend-symbol legend-symbol--runner"
            aria-hidden="true"
          />{" "}
          Corredor
        </span>
        <span>
          <i
            className="legend-symbol legend-symbol--horde"
            aria-hidden="true"
          />{" "}
          Horda
        </span>
        <span>
          <i
            className="legend-symbol legend-symbol--dormant"
            aria-hidden="true"
          />{" "}
          Dormido
        </span>
        <span>
          <i
            className="legend-symbol legend-symbol--shelter"
            aria-hidden="true"
          />{" "}
          Refugio
        </span>
        <span>
          <i className="legend-line" aria-hidden="true" /> Calle bloqueada
        </span>
        <span>
          <i className="legend-route legend-route--safe" aria-hidden="true" />{" "}
          Ruta segura
        </span>
        <span>
          <i className="legend-route" aria-hidden="true" /> Ruta alternativa
        </span>
      </div>
    </section>
  );
});

export default MantaMap;
