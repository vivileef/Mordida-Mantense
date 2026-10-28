import { divIcon } from "leaflet";
import { Fragment, useEffect, useRef, useState } from "react";
import {
  Circle,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import { center } from "../data/demoWorld";

const labels = {
  caminante: "Walker / Caminante",
  walker: "Walker / Caminante",
  corredor: "Runner / Corredor",
  runner: "Runner / Corredor",
  horda: "Horde / Horda",
  horde: "Horde / Horda",
  dormido: "Dormant / Dormido",
  dormant: "Dormant / Dormido",
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
function coordinates(world) {
  return new Map(
    (world?.nodos || []).map((node) => [node.id, [node.lat, node.lng]]),
  );
}
function middleOf(path) {
  if (path.length < 2) return path[0];
  return [(path[0][0] + path[1][0]) / 2, (path[0][1] + path[1][1]) / 2];
}

function geometryToPositions(geometry) {
  if (!geometry) return [];

  // GeoJSON Feature
  if (geometry.type === "Feature") {
    return geometryToPositions(geometry.geometry);
  }

  // GeoJSON LineString: las coordenadas vienen como [longitud, latitud].
  if (geometry.type === "LineString") {
    return (geometry.coordinates || [])
      .filter(
        (point) =>
          Array.isArray(point) &&
          point.length >= 2 &&
          Number.isFinite(Number(point[0])) &&
          Number.isFinite(Number(point[1])),
      )
      .map(([lng, lat]) => [Number(lat), Number(lng)]);
  }

  // GeoJSON MultiLineString: conserva cada tramo independiente.
  if (geometry.type === "MultiLineString") {
    return (geometry.coordinates || [])
      .map((line) =>
        line
          .filter(
            (point) =>
              Array.isArray(point) &&
              point.length >= 2 &&
              Number.isFinite(Number(point[0])) &&
              Number.isFinite(Number(point[1])),
          )
          .map(([lng, lat]) => [Number(lat), Number(lng)]),
      )
      .filter((line) => line.length > 1);
  }

  // Arreglos de puntos [lat, lng] o { lat, lng }.
  const points = geometry.coordinates ?? geometry;

  if (!Array.isArray(points)) return [];

  return points
    .map((point) => {
      if (
        Array.isArray(point) &&
        point.length >= 2 &&
        Number.isFinite(Number(point[0])) &&
        Number.isFinite(Number(point[1]))
      ) {
        return [Number(point[0]), Number(point[1])];
      }

      if (
        point &&
        Number.isFinite(Number(point.lat)) &&
        Number.isFinite(Number(point.lng))
      ) {
        return [Number(point.lat), Number(point.lng)];
      }

      return null;
    })
    .filter(Boolean);
}

function streetGeometry(street) {
  return geometryToPositions(
    street.geometry ??
      street.geometria ??
      street.coordinates ??
      street.coordenadas,
  );
}

function routeGeometry(route, nodeMap) {
  const explicit = geometryToPositions(
    route.geometry ?? route.geometria ?? route.coordinates ?? route.coordenadas,
  );

  if (explicit.length > 1) return explicit;

  if (Array.isArray(route.nodes)) {
    return route.nodes.map((id) => nodeMap.get(id)).filter(Boolean);
  }

  return [];
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

export default function MantaMap({
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
    survivors: true,
    zombies: true,
    shelters: true,
    blocked: true,
    routes: true,
  });
  const nodeMap = coordinates(world);
  const hasStreetGeometry = (world?.calles || []).some((street) => {
    const path = streetGeometry(street);
    return path.length > 1;
  });
  const hasRouteGeometry = (world?.rutas || []).some(
    (route) => routeGeometry(route, nodeMap).length > 1,
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
      {(!hasStreetGeometry || (layers.routes && !hasRouteGeometry)) && (
        <div className="map-notice">
          {!hasStreetGeometry
            ? "Calles del grafo sin geometría: se muestra el mapa OSM."
            : "Rutas sin geometría vial: trazado pendiente del backend."}
        </div>
      )}
      <div className="map-controls" aria-label="Capas del mapa">
        {[
          ["survivors", "Sobrevivientes"],
          ["zombies", "Zombies"],
          ["shelters", "Refugios"],
          ["routes", "Rutas"],
          ["blocked", "Calles bloqueadas"],
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
        {(world?.calles || []).map((street, index) => {
          const path = streetGeometry(street);
          const blocked = (world.aristasBloqueadas || []).some(
            (edge) =>
              edge.includes(street.origen) && edge.includes(street.destino),
          );
          if (blocked && !layers.blocked) return null;
          if (!path.length) return null;
          return (
            <Fragment key={`street-${index}`}>
              <Polyline
                positions={path}
                pathOptions={{
                  color: blocked ? "#FF9F1C" : "#3B2A6B",
                  weight: blocked ? 5 : 2,
                  dashArray: blocked ? "8 8" : undefined,
                  opacity: blocked ? 0.95 : 0.75,
                }}
              />
              {blocked && path.length > 1 && (
                <AnimatedMarker
                  position={middleOf(path)}
                  icon={entityIcon("blocked", "Calle bloqueada")}
                >
                  <Tooltip>Calle bloqueada</Tooltip>
                  <Popup>
                    <b>Calle bloqueada</b>
                    <br />
                    Conexión: {street.origen} → {street.destino}
                    <br />
                    Estado: no disponible
                  </Popup>
                </AnimatedMarker>
              )}
            </Fragment>
          );
        })}
        {layers.routes &&
          (world?.rutas || []).map((route) => {
            const path = routeGeometry(route, nodeMap);
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
                      {labels[type] || zombie.tipo}: {zombie.id}
                    </Tooltip>
                    <Popup>
                      <b>{zombie.id}</b>
                      <br />
                      Tipo: {labels[type] || zombie.tipo}
                      <br />
                      Ubicación: {zombie.nodo}
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
                <Tooltip>Sobreviviente: {survivor.id}</Tooltip>
                <Popup>
                  <b>{survivor.id}</b>
                  <br />
                  Tipo: sobreviviente
                  <br />
                  Ubicación: {survivor.nodo}
                  <br />
                  Estado: {survivor.activo ? "en camino" : "eliminado"}
                  <br />
                  Destino: {survivor.refugioId}
                </Popup>
              </Marker>
            );
          })}
        {layers.shelters &&
          (world?.refugios || []).map((shelter) => {
            const position = nodeMap.get(shelter.nodo);
            return position ? (
              <Marker
                position={position}
                icon={entityIcon("shelter", "Refugio seguro")}
                key={shelter.id}
              >
                <Tooltip>Refugio: {shelter.id}</Tooltip>
                <Popup>
                  <b>{shelter.id}</b>
                  <br />
                  Tipo: refugio seguro
                  <br />
                  Ubicación: {shelter.nodo}
                  <br />
                  Estado: disponible
                  {shelter.capacidad ? (
                    <>
                      <br />
                      Capacidad: {shelter.capacidad}
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
}
