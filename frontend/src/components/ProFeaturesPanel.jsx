import "./ProFeaturesPanel.css";
import {
  createDisplayNames,
  displayEntityName,
  intersectionDisplayName,
} from "../utils/presentation";
import { forecastRunnerMovements } from "../services/runnerForecast";

function firstArray(object, ...keys) {
  for (const key of keys) {
    if (Array.isArray(object?.[key])) return object[key];
  }
  return null;
}

function valueOf(object, ...keys) {
  for (const key of keys) {
    if (object?.[key] !== undefined && object?.[key] !== null)
      return object[key];
  }
  return undefined;
}

function refugeOccupancy(refuge) {
  const occupied = Number(
    valueOf(refuge, "ocupados", "occupied", "ocupacion", "occupancy"),
  );
  const capacity = Number(valueOf(refuge, "capacidad", "capacity"));
  const hasOccupied =
    valueOf(refuge, "ocupados", "occupied", "ocupacion", "occupancy") != null;
  const hasCapacity = valueOf(refuge, "capacidad", "capacity") != null;
  const fullFlag = valueOf(refuge, "lleno", "full") === true;
  const hasValidCounts =
    hasOccupied &&
    hasCapacity &&
    Number.isFinite(occupied) &&
    Number.isFinite(capacity);

  if (
    fullFlag ||
    (hasOccupied && hasCapacity && capacity > 0 && occupied >= capacity)
  ) {
    return {
      full: true,
      label: hasValidCounts
        ? `${occupied}/${capacity} personas`
        : "Refugio lleno",
    };
  }
  if (
    hasValidCounts
  ) {
    return { full: false, label: `${occupied}/${capacity} personas` };
  }
  if (hasCapacity && Number.isFinite(capacity)) {
    return {
      full: false,
      label: `Capacidad: ${capacity} personas; ocupación no informada`,
    };
  }
  return { full: false, label: "Capacidad no informada" };
}

function readableName(value, fallback) {
  if (typeof value !== "string") return fallback;
  const name = value.trim();
  return name && !/^(?:[A-Z]+[-_]\d+|\d+)$/i.test(name) ? name : fallback;
}

function readableStatus(value) {
  if (value == null || value === "") return "Estado no informado";
  const status = String(value)
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim();
  if (/^(?:[A-Z]+\s+\d+|\d+)$/i.test(status)) return "Estado informado";
  const knownStatuses = {
    activo: "Disponible",
    disponible: "Disponible",
    ready: "Disponible",
    available: "Disponible",
    moving: "En camino",
    "en route": "En camino",
    moviendo: "En camino",
    "en camino": "En camino",
    operational: "En servicio",
    "in service": "En servicio",
    "en servicio": "En servicio",
    assigned: "Asignado",
    asignado: "Asignado",
    inactivo: "Fuera de servicio",
    offline: "Fuera de servicio",
    "fuera de servicio": "Fuera de servicio",
    averia: "En mantenimiento",
    "en mantenimiento": "En mantenimiento",
  };
  return knownStatuses[status.toLowerCase()] ?? "Estado informado";
}

export default function ProFeaturesPanel({ world, mode = "demo", onDispatch, dispatchLoading = false, dispatchFeedback = "" }) {
  const receivedPredictions = firstArray(
    world,
    "prediccionesCorredores",
    "predictions",
  );
  const predictions = receivedPredictions ?? (world ? forecastRunnerMovements(world) : null);
  const rescue = world?.rescate ?? world?.rescue;
  const vehicles = firstArray(rescue, "vehiculos", "vehicles");
  const assignments = firstArray(rescue, "asignaciones", "assignments");
  const refuges = firstArray(world, "refugios", "refuges");
  const knownMissingFields = world?.camposEstadoAusentes ?? [];
  const displayNames = createDisplayNames(world);
  const nodesById = new Map(
    (world?.nodos ?? []).map((node) => [String(node.id), node]),
  );

  const refugeDetails =
    refuges?.map((refuge, index) => ({
      id: String(refuge.id ?? refuge.refugioId ?? index),
      name: readableName(
        valueOf(refuge, "nombre", "nombreCompleto", "name", "fullName", "displayName", "descripcion", "description"),
        `Refugio ${index + 1}`,
      ),
      ...refugeOccupancy(refuge),
    })) ?? [];
  const fullRefugeCount = refugeDetails.filter((refuge) => refuge.full).length;

  const predictionsAvailable = predictions !== null;
  const vehiclesAvailable = vehicles !== null;
  const assignmentsAvailable = assignments !== null;
  const refugesAvailable =
    refuges !== null && !knownMissingFields.includes("refugios");

  return (
    <section
      className="pro-panel"
      aria-label="Indicadores de predicción y rescate"
    >
      <div className="pro-panel__header">
        <div>
          <span className="pro-panel__eyebrow">INDICADORES OPERATIVOS</span>
          <h2>Predicción y rescate</h2>
          <p className="pro-panel__description">
            {receivedPredictions === null
              ? "Estimación local de trayectorias según las calles disponibles."
              : "Resume la información recibida del sistema."}{mode === "demo" ? " El rescate también se simula por turnos." : " Despacho de vehiculos."}
          </p>
        </div>
        <span
          className={`pro-panel__source pro-panel__source--${mode === "api" ? "api" : "demo"}`}
        >
          {mode === "api" ? "DATOS DEL SISTEMA" : "DEMOSTRACIÓN"}
        </span>
      </div>

      <div className="pro-grid">
        <article className="pro-card pro-card--prediction" aria-label="Corredores anticipados">
          <div className="pro-card__topline">
            <span className="pro-card__symbol pro-card__symbol--prediction">
              PRONÓSTICO
            </span>
            <span className="pro-card__label">Posibles movimientos de amenazas</span>
          </div>
          {!predictionsAvailable ? (
            <p className="pro-card__empty">
              Información de predicción no disponible.
            </p>
          ) : (
            <>
              <strong className="pro-card__metric">{predictions.length}</strong>
              <p className="pro-card__summary">
                {predictions.length === 0
                  ? "No hay amenazas con movimientos proyectados."
                  : receivedPredictions === null
                    ? "Trayectorias estimadas para los próximos tramos."
                    : "Corredores proyectados en el estado actual."}
              </p>
              {predictions.length > 0 && (
                <ul className="pro-card__list">
                  {predictions.slice(0, 3).map((prediction, index) => {
                    const rawId = prediction.corredorId ?? prediction.id;
                    const id = rawId == null ? "" : String(rawId);
                    const nodes =
                      prediction.nodosPredichos ??
                      prediction.nodesPredicted ??
                      [];
                    return (
                      <li key={id || `prediccion-${index}`}>
                        <span>
                          {id && displayNames.zombies.has(id)
                            ? displayEntityName(
                                displayNames,
                                "zombies",
                                id,
                                `Corredor ${index + 1}`,
                              )
                            : `${prediction.tipo ?? "Amenaza"} ${index + 1}`}
                        </span>
                        <small>
                          {Array.isArray(nodes) && nodes.length
                            ? nodes
                                .map((nodeId) => {
                                  const node = nodesById.get(String(nodeId));
                                  return node
                                    ? intersectionDisplayName(
                                        node,
                                        world?.calles ?? [],
                                      )
                                    : "Intersección";
                                })
                                .join(" → ")
                            : "Trayectoria no informada"}
                        </small>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </article>

        <article className="pro-card pro-card--refuge" aria-label="Capacidad de refugios">
          <div className="pro-card__topline">
            <span className="pro-card__symbol pro-card__symbol--refuge">
              REFUGIOS
            </span>
            <span className="pro-card__label">Capacidad de refugios</span>
          </div>
          {!refugesAvailable ? (
            <p className="pro-card__empty">
              Información de refugios no disponible.
            </p>
          ) : (
            <>
              <strong className="pro-card__metric">
                {refugeDetails.length}
              </strong>
              <p className="pro-card__summary">
                {fullRefugeCount > 0
                  ? `${fullRefugeCount} refugio(s) identificado(s) como lleno(s).`
                  : "No hay refugios identificados como llenos."}
              </p>
              {refugeDetails.length > 0 && (
                <ul className="pro-card__list">
                  {refugeDetails.slice(0, 4).map((refuge) => (
                    <li key={refuge.id}>
                      <span>{refuge.name}</span>
                      <small className={refuge.full ? "pro-card__warning" : ""}>
                        {refuge.label}
                      </small>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </article>

        <article className="pro-card pro-card--rescue" aria-label="Flota de rescate">
          <div className="pro-card__topline">
            <span className="pro-card__symbol pro-card__symbol--rescue">
              FLOTA
            </span>
            <span className="pro-card__label">Vehículos de rescate</span>
          </div>
          {!vehiclesAvailable ? (
            <p className="pro-card__empty">
              Información de vehículos de rescate no disponible.
            </p>
          ) : (
            <>
              <strong className="pro-card__metric">{vehicles.length}</strong>
              <p className="pro-card__summary">
                {vehicles.length === 0
                  ? "No hay vehículos informados."
                  : mode === "demo"
                    ? "La ambulancia puede recoger sobrevivientes y llevarlos a su refugio por turnos."
                    : "Vehículos informados por el sistema; el panel no confirma un rescate en curso."}
              </p>
              {vehicles.length > 0 && (
                <ul className="pro-card__list">
                  {vehicles.slice(0, 4).map((vehicle, index) => {
                    const vehicleName = readableName(
                      valueOf(vehicle, "nombre", "name", "displayName", "descripcion", "description"),
                      `Vehículo ${index + 1}`,
                    );
                    const status = valueOf(
                      vehicle,
                      "status",
                      "estado",
                      "situacion",
                    );
                    return (
                      <li
                        key={String(vehicle.id ?? vehicle.vehiculoId ?? index)}
                      >
                        <span>{vehicleName}</span>
                        <small>{readableStatus(status)}</small>
                      </li>
                    );
                  })}
                </ul>
              )}
              {assignmentsAvailable && (
                <p className="pro-card__footnote">
                  Personas o tareas asignadas:{" "}
                  <strong>{assignments.length}</strong>
                </p>
              )}
              {mode === "api" && vehicles.some((vehicle) => ["disponible", "available", "ready"].includes(String(valueOf(vehicle, "fase", "estado", "status")).toLowerCase())) && (world?.sobrevivientes ?? []).some((survivor) => survivor.activo && !survivor.abordo) && (
                <form className="pro-dispatch" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); onDispatch?.(String(data.get("vehicle")), String(data.get("survivor"))); }}>
                  <label>Vehículo<select name="vehicle">{vehicles.filter((vehicle) => ["disponible", "available", "ready"].includes(String(valueOf(vehicle, "fase", "estado", "status")).toLowerCase())).map((vehicle, index) => <option key={String(vehicle.id ?? vehicle.vehiculoId ?? index)} value={String(vehicle.id ?? vehicle.vehiculoId)}>{readableName(valueOf(vehicle, "nombre", "name"), `Vehículo ${index + 1}`)}</option>)}</select></label>
                  <label>Persona<select name="survivor">{(world?.sobrevivientes ?? []).filter((survivor) => survivor.activo && !survivor.abordo).map((survivor, index) => <option key={String(survivor.id)} value={String(survivor.id)}>{displayEntityName(displayNames, "survivors", survivor.id, `Persona ${index + 1}`)}</option>)}</select></label>
                  <button type="submit" disabled={dispatchLoading || !onDispatch}>{dispatchLoading ? "Despachando…" : "Despachar"}</button>
                  {dispatchFeedback && <span role={dispatchFeedback === "No se pudo completar el despacho." ? "alert" : "status"}>{dispatchFeedback}</span>}
                </form>
              )}
            </>
          )}
          {vehiclesAvailable && !assignmentsAvailable && (
            <p className="pro-card__footnote">
              No se informan personas o tareas asignadas.
            </p>
          )}
        </article>
      </div>
    </section>
  );
}
