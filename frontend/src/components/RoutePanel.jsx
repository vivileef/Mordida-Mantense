import { memo, useMemo } from "react";
import { createDisplayNames, displayEntityName } from "../utils/presentation";

function routeLabel(route) {
  if (!route) return { label: "Ruta no disponible", unavailable: true };
  const status = String(route.status ?? "").toLowerCase().replaceAll("_", "-");
  if (route.bloqueada === true || ["blocked", "bloqueada"].includes(status)) {
    return { label: "Ruta bloqueada", unavailable: true };
  }
  if (
    route.status === "sin_ruta" ||
    ["sin-ruta", "unavailable"].includes(status)
  ) {
    return { label: "Ruta no disponible", unavailable: true };
  }
  if (["invalid", "invalida"].includes(status)) {
    return { label: "Ruta no disponible", unavailable: true };
  }
  if (route.alternativa === true || ["alternative", "alternativa"].includes(status)) {
    return { label: "Ruta alternativa", unavailable: false };
  }
  if (["active", "activa", "safe", "segura"].includes(status)) {
    return { label: "Ruta activa", unavailable: false };
  }
  return { label: "Ruta publicada", unavailable: false };
}

function survivorReachedDestination(survivor, refuges) {
  const destinationId = survivor?.refugioId ?? survivor?.refugeId;
  if (destinationId == null || survivor?.nodo == null) return false;
  const refuge = refuges.find(
    (item) => String(item.id ?? item.refugioId) === String(destinationId),
  );
  const refugeNode = refuge?.nodo ?? refuge?.node;
  return refugeNode != null && String(survivor.nodo) === String(refugeNode);
}

const RoutePanel = memo(function RoutePanel({
  world,
  selectedId,
  onSelect,
  mode = "demo",
  routeLookup,
}) {
  const routes = world?.rutas || [];
  const survivors = world?.sobrevivientes || [];
  const refuges = world?.refugios || [];
  const routesAvailable =
    mode === "demo" || !world?.camposEstadoAusentes?.includes("rutas");
  const names = useMemo(() => createDisplayNames(world), [
    world?.zombies,
    world?.sobrevivientes,
    world?.refugios,
  ]);
  const routeBySurvivor = new Map(
    routes.map((route) => [
      String(route.survivorId ?? route.sobrevivienteId ?? ""),
      route,
    ]),
  );
  const survivorRows = survivors.map((survivor, index) => ({
    id: survivor.id,
    survivor,
    route: routeBySurvivor.get(String(survivor.id)),
    name: displayEntityName(names, "survivors", survivor.id, "Superviviente"),
    destinationId: survivor.refugioId ?? survivor.refugeId,
    arrived: survivorReachedDestination(survivor, refuges),
    key: survivor.id == null ? `survivor-${index}` : String(survivor.id),
  }));
  const knownSurvivorIds = new Set(
    survivors.map((survivor) => String(survivor.id)),
  );
  const routeOnlyRows = (mode === "demo" ? routes : [])
    .filter((route) => {
      const id = route.survivorId ?? route.sobrevivienteId;
      return id != null && !knownSurvivorIds.has(String(id));
    })
    .map((route, index) => ({
      id: route.survivorId ?? route.sobrevivienteId,
      survivor: null,
      route,
      name: displayEntityName(
        names,
        "survivors",
        route.survivorId ?? route.sobrevivienteId,
        "Superviviente",
      ),
      destinationId: route.refugeId ?? route.refugioId,
      arrived: false,
      key: String(route.survivorId ?? route.sobrevivienteId ?? `route-${index}`),
    }));
  const rows = [...survivorRows, ...routeOnlyRows];
  const sourceDescription = world?.rutasCalculadasLocalmente
    ? "Rutas de prueba calculadas en este dispositivo."
    : mode === "demo"
      ? "Rutas simuladas para esta demostración."
      : routes.length
        ? "Rutas recibidas del sistema."
        : routeLookup?.status === "loading"
          ? "Consultando la ruta de la persona seleccionada."
          : routeLookup?.status === "unavailable"
            ? "Ruta no disponible para la persona seleccionada."
            : routeLookup?.status === "error"
              ? routeLookup.error === "unauthorized"
                ? "No se pudo consultar la ruta por falta de autorización."
                : routeLookup.error === "server"
                  ? "El sistema no pudo responder la consulta de ruta. Inténtalo más tarde."
                  : routeLookup.error === "network"
                    ? "No se pudo contactar al sistema para consultar la ruta."
                    : "No se pudo consultar la ruta. Inténtalo más tarde."
              : world?.camposEstadoAusentes?.includes("rutas")
                ? "Información de rutas no disponible."
                : "No hay rutas publicadas en este momento.";

  return (
    <section className="panel route-panel">
      <div className="panel__heading">
        <h2>Rutas de escape</h2>
        <span className="panel-count">
          {routesAvailable
            ? `${routes.length} ${routes.length === 1 ? "RUTA" : "RUTAS"}`
            : "INFORMACIÓN NO DISPONIBLE"}
        </span>
      </div>
      <p className="panel-source">{sourceDescription}</p>
      <div className="route-list">
        {rows.map((row) => {
          const status = row.arrived
            ? { label: "Llegó al refugio", unavailable: false }
            : routesAvailable
              ? routeLabel(row.route)
              : { label: "Información no disponible", unavailable: true };
          const destination =
            row.destinationId == null
              ? ""
              : displayEntityName(
                  names,
                  "shelters",
                  row.destinationId,
                  "Refugio",
                );
          return (
            <button
              className={`route-card ${String(selectedId) === String(row.id) ? "is-selected" : ""}`}
              key={row.key}
              type="button"
              aria-pressed={String(selectedId) === String(row.id)}
              onClick={() => row.id != null && onSelect(String(row.id))}
              disabled={row.id == null}
            >
              <span className="route-card__identity">
                <strong className="route-card__name">{row.name}</strong>
                {destination && (
                  <small className="route-card__destination">
                    {row.arrived ? "Llegó a" : "Destino:"} {destination}
                  </small>
                )}
              </span>
              <span
                className={`status-pill ${status.unavailable ? "status-pill--invalida" : "status-pill--activa"}`}
              >{status.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
});

export default RoutePanel;
