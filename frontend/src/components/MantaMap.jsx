import { divIcon } from "leaflet";
import { Fragment, memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Circle,
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
  isBlocked,
  resolveRoadMap,
  routeGeometry,
  streetGeometry,
} from "../services/geo";
import {
  createDisplayNames,
  displayEntityName,
  intersectionDisplayName,
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
  const positionsKey = positions.map(([lat, lng]) => `${lat},${lng}`).join(";");

  useEffect(() => {
    if (!hasFittedWorld.current && positions.length > 1) {
      map.fitBounds(positions, { padding: [24, 24], maxZoom: 15 });
      hasFittedWorld.current = true;
    }
  }, [map, positionsKey]);

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
  const [selectedStreet, setSelectedStreet] = useState(null);
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
  const displayNames = useMemo(() => createDisplayNames(world), [
    world?.zombies,
    world?.sobrevivientes,
    world?.refugios,
  ]);
  const nodeMap = useMemo(() => coordinates(mapWorld), [mapWorld?.nodos]);
  const streetMap = useMemo(
    () => new Map(
      (mapWorld?.calles || []).map((street) => [
        `${street.origen}|${street.destino}`,
        street,
      ]),
    ),
    [mapWorld?.calles],
  );
  const hasStreetGeometry = useMemo(
    () => (mapWorld?.calles || []).some((street) =>
      streetGeometry(street, nodeMap).length > 1,
    ),
    [mapWorld?.calles, nodeMap],
  );
  const hasRouteGeometry = useMemo(
    () => (world?.rutas || []).some(
      (route) => routeGeometry(route, nodeMap, streetMap).length > 1,
    ),
    [world?.rutas, nodeMap, streetMap],
  );
  const mapPositions = useMemo(() => [...nodeMap.values()], [nodeMap]);
  const invalidEntities = useMemo(() => [
    ...(world?.zombies || []).map((item) => ["zombies", item.id, item.nodo]),
    ...(world?.sobrevivientes || []).map((item) => [
      "survivors",
      item.id,
      item.nodo,
    ]),
    ...(world?.refugios || []).map((item) => [
      "shelters",
      item.id,
      item.nodo ?? item.node,
    ]),
  ].filter(([, , node]) => node == null || !nodeMap.has(String(node))), [
    world?.zombies,
    world?.sobrevivientes,
    world?.refugios,
    nodeMap,
  ]);
  const routeDiagnostics = useMemo(() => (world?.rutas || []).flatMap((route) => {
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
          routeGeometry({ nodes: [origin, destination] }, nodeMap, streetMap)
            .length < 2
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
  }), [world?.rutas, nodeMap, streetMap]);
  const routesWithoutGeometry = useMemo(
    () => (world?.rutas || []).filter(
      (route) => routeGeometry(route, nodeMap, streetMap).length < 2,
    ),
    [world?.rutas, nodeMap, streetMap],
  );
  const toggleLayer = (layer) =>
    setLayers((current) => ({ ...current, [layer]: !current[layer] }));
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
      {mode === "api" && layers.routes && (world?.rutas?.length ?? 0) === 0 && (
        <div className="map-notice">El backend no publicó rutas seguras en este estado.</div>
      )}
      {mode === "api" && layers.blocked && (world?.aristasBloqueadas?.length ?? 0) === 0 && (
        <div className="map-notice">El backend no informa calles bloqueadas en este estado.</div>
      )}
      {invalidEntities.length > 0 && (
        <div className="map-notice map-notice--error">
          Entidades omitidas:{" "}
          {invalidEntities
            .map(([kind, id]) =>
              displayEntityName(
                displayNames,
                kind,
                id,
                kind === "survivors"
                  ? "Sobreviviente"
                  : kind === "zombies"
                    ? "Zombie"
                    : "Refugio",
              ),
            )
            .join("; ")}
          . Su ubicación no está disponible en el mapa.
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
        {(mapWorld?.calles || []).map((street, index) => {
          const path = streetGeometry(street, nodeMap);
          const blocked = isBlocked(world, street);
          if (blocked ? !layers.blocked : !layers.streets) return null;
          if (!path.length) return null;
          return (
            <Fragment key={`street-${index}`}>
              <Polyline
                positions={path}
                pathOptions={{
                  color: blocked ? "#FF9F1C" : "#3B2A6B",
                  weight: selectedStreet === street ? 6 : blocked ? 5 : 2,
                  dashArray: blocked ? "8 8" : undefined,
                  opacity:
                    selectedStreet === street ? 1 : blocked ? 0.95 : 0.75,
                }}
                eventHandlers={{ click: () => setSelectedStreet(street) }}
              >
                <Tooltip sticky>{streetDisplayName(street)}</Tooltip>
                <Popup>
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
                  Estado: {blocked ? "bloqueada" : "transitable"}
                  {selectedStreet === street ? " · seleccionada" : ""}
                </Popup>
              </Polyline>
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
          (world?.rutas || []).map((route) => {
            const path = routeGeometry(route, nodeMap, streetMap);
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
          (world?.zombies || [])
            .filter((zombie) => zombie.visible !== false)
            .map((zombie) => {
              const position = nodeMap.get(zombie.nodo);
              if (!position) return null;
              const type = String(zombie.tipo || "").toLowerCase();
              const kind = markerKind(type);
              const isHorde = type === "horda" || type === "horde";
              return (
                <Fragment key={zombie.id}>
                  {isHorde && (
                    <Circle
                      center={position}
                      radius={260}
                      pathOptions={{
                        color: "#8B5CF6",
                        fillColor: "#8B5CF6",
                        fillOpacity: 0.12,
                        weight: 1,
                        dashArray: "5 8",
                      }}
                    />
                  )}
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
                      {intersectionDisplayName(
                        mapWorld?.nodos?.find(
                          (node) => node.id === zombie.nodo,
                        ),
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
                      {zombie.visible === false ? "oculto" : "detectado"}
                    </Popup>
                  </Marker>
                </Fragment>
              );
            })}
        {layers.survivors &&
          (world?.sobrevivientes || []).map((survivor) => {
            const position = nodeMap.get(survivor.nodo);
            if (!position) return null;
            return (
              <Marker
                position={position}
                icon={entityIcon("survivor", "Sobreviviente")}
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
                    mapWorld?.nodos?.find((node) => node.id === survivor.nodo),
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
            const position = nodeMap.get(shelterNode);
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
                    mapWorld?.nodos?.find((node) => node.id === shelterNode),
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
