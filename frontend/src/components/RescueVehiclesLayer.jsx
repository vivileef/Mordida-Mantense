import { useMemo } from "react";
import { divIcon } from "leaflet";
import { Marker, Popup, Tooltip } from "react-leaflet";
import "./RescueVehiclesLayer.css";

function firstValue(object, ...keys) {
  for (const key of keys) {
    if (object?.[key] !== undefined && object?.[key] !== null && object[key] !== "") {
      return object[key];
    }
  }
  return undefined;
}

function normalizeStatus(value) {
  if (value === undefined || value === null || value === "") return "Estado no informado";
  const status = String(value).replaceAll("_", " ").replaceAll("-", " ").trim();
  const labels = {
    available: "Disponible",
    ready: "Disponible",
    activo: "Disponible",
    disponible: "Disponible",
    moving: "En camino",
    "en route": "En camino",
    "en camino": "En camino",
    assigned: "Asignado",
    asignado: "Asignado",
    inactive: "Fuera de servicio",
    inactivo: "Fuera de servicio",
    offline: "Fuera de servicio",
    "fuera de servicio": "Fuera de servicio",
    maintenance: "En mantenimiento",
    averia: "En mantenimiento",
  };
  return labels[status.toLowerCase()] ?? status;
}

function readableName(value, fallback) {
  if (typeof value !== "string") return fallback;
  const name = value.trim();
  return name && !/^(?:[A-Z]+[-_]\d+|\d+)$/i.test(name) ? name : fallback;
}

function getVehiclePosition(vehicle, nodeMap) {
  const location = firstValue(vehicle, "posicion", "position", "ubicacion", "location");
  const lat = Number(firstValue(vehicle, "lat", "latitude") ?? firstValue(location, "lat", "latitude"));
  const lng = Number(
    firstValue(vehicle, "lng", "lon", "longitude") ??
    firstValue(location, "lng", "lon", "longitude"),
  );

  if (
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
  ) {
    return [lat, lng];
  }

  const nodeId = firstValue(
    vehicle,
    "nodo",
    "node",
    "nodoActual",
    "currentNode",
    "current_node",
  ) ?? firstValue(location, "nodo", "node", "idNodo", "nodeId");

  if (nodeId === undefined) return null;
  const node = nodeMap.get(String(nodeId));
  return node ? [node.lat, node.lng ?? node.lon] : null;
}

function getVehicleIcon(status) {
  const normalized = String(status ?? "").toLowerCase();
  const isMoving = /mov|route|ruta|desplaz|en camino/.test(normalized);
  const isUnavailable = /inactivo|fuera|aver[ií]a|deshabil|offline/.test(normalized);
  const tone = isUnavailable ? "unavailable" : isMoving ? "moving" : "ready";

  return divIcon({
    className: "rescue-vehicle-icon-wrapper",
    html: `<span class="rescue-vehicle-icon rescue-vehicle-icon--${tone}" aria-hidden="true"><svg viewBox="0 0 48 36" focusable="false"><ellipse class="rescue-vehicle-shadow" cx="24" cy="32" rx="19" ry="2.5"/><path class="rescue-vehicle-body" d="M4 11a3 3 0 0 1 3-3h19a3 3 0 0 1 3 3v3h7l7 7v8H5a3 3 0 0 1-3-3V13a2 2 0 0 1 2-2Z"/><path class="rescue-vehicle-window" d="M31 17v6h8l-5-6Z"/><path class="rescue-vehicle-mark" d="M14 12h4v4h4v4h-4v4h-4v-4h-4v-4h4Z"/><path class="rescue-vehicle-detail" d="M2 23h3v3H2zm27-8v12"/><circle class="rescue-vehicle-wheel" cx="12" cy="28" r="4"/><circle class="rescue-vehicle-wheel" cx="34" cy="28" r="4"/><circle class="rescue-vehicle-hub" cx="12" cy="28" r="1.5"/><circle class="rescue-vehicle-hub" cx="34" cy="28" r="1.5"/></svg></span>`,
    iconSize: [44, 36],
    iconAnchor: [22, 18],
    popupAnchor: [0, -18],
  });
}

function displayValue(value, suffix = "") {
  if (value === undefined || value === null || value === "") return "Información no disponible";
  if (typeof value === "number" && !Number.isFinite(value)) return "Información no disponible";
  const text = String(value);
  if (/^(undefined|null|nan)$/i.test(text) || /^(?:[A-Z]+[-_]\d+|\d+)$/i.test(text)) {
    return "Información no disponible";
  }
  return `${text}${suffix}`;
}

export default function RescueVehiclesLayer({ world }) {
  const vehicles = world?.rescate?.vehiculos ?? world?.rescue?.vehicles;
  const refuges = world?.refugios ?? world?.refuges ?? [];
  const nodes = world?.nodos ?? world?.nodes ?? [];

  const nodeMap = useMemo(
    () => new Map(
      (Array.isArray(nodes) ? nodes : [])
        .filter((node) => node?.id != null && Number.isFinite(Number(node.lat ?? node.latitude)) && Number.isFinite(Number(node.lng ?? node.lon ?? node.longitude)))
        .map((node) => [String(node.id), {
          ...node,
          lat: Number(node.lat ?? node.latitude),
          lng: Number(node.lng ?? node.lon ?? node.longitude),
        }]),
    ),
    [nodes],
  );

  if (!Array.isArray(vehicles) || vehicles.length === 0) return null;

  return vehicles.map((vehicle, index) => {
    const position = getVehiclePosition(vehicle, nodeMap);
    if (!position) return null;

    const id = String(firstValue(vehicle, "id", "vehiculoId", "vehicleId", "vehicle_id") ?? index);
    const vehicleName = readableName(
      firstValue(vehicle, "nombre", "name", "displayName", "descripcion", "description"),
      `Vehículo de rescate ${index + 1}`,
    );
    const status = firstValue(vehicle, "status", "estado", "situacion");
    const passengers = firstValue(vehicle, "pasajeros", "ocupantes", "passengers", "occupants");
    const capacity = firstValue(vehicle, "capacidad", "capacity", "capacidadPersonas");
    const speed = firstValue(vehicle, "velocidad", "speed");
    const target = firstValue(vehicle, "refugioId", "refugeId", "idRefugio", "shelterId", "nodoObjetivo", "targetNode", "destino", "destination");
    const targetRefuge = Array.isArray(refuges) ? refuges.find((refuge) =>
      String(refuge.id ?? refuge.refugioId) === String(target) || String(refuge.nodo ?? refuge.node) === String(target)
    ) : null;
    const targetNode = nodeMap.get(String(targetRefuge?.nodo ?? targetRefuge?.node ?? target));
    const targetName = targetRefuge
      ? readableName(firstValue(targetRefuge, "nombre", "name", "displayName", "descripcion", "description"), `Refugio ${targetRefuge.id ?? targetRefuge.refugioId ?? "asignado"}`)
      : targetNode
      ? readableName(
          firstValue(targetNode, "nombre", "name", "displayName", "descripcion", "description"),
          "Refugio asignado",
        )
      : readableName(target, "Destino informado");

    return (
      <Marker
        key={id}
        position={position}
        icon={getVehicleIcon(status)}
        keyboard
        riseOnHover
      >
        <Tooltip direction="top" offset={[0, -12]}>{vehicleName}</Tooltip>
        <Popup>
          <div className="rescue-vehicle-popup">
            <strong>{vehicleName}</strong>
            <span>Estado: {normalizeStatus(status)}</span>
            {passengers !== undefined && <span>Personas a bordo: {displayValue(passengers)}</span>}
            {capacity !== undefined && <span>Capacidad: {displayValue(capacity, " personas")}</span>}
            {speed !== undefined && <span>Velocidad: {displayValue(speed, " km/h")}</span>}
            {target !== undefined && <span>Se dirige a: {targetName}</span>}
          </div>
        </Popup>
      </Marker>
    );
  });
}
