import "./ProFeaturesPanel.css";
import {
  createDisplayNames,
  displayEntityName,
  intersectionDisplayName,
} from "../utils/presentation";

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

export default function ProFeaturesPanel({ world, mode = "demo" }) {
  const predictions = firstArray(
    world,
    "prediccionesCorredores",
    "predictions",
  );
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
            Resume la información recibida. No calcula predicciones ni envía
            vehículos a rescatar.
          </p>
        </div>
        <span
          className={`pro-panel__source pro-panel__source--${mode === "api" ? "api" : "demo"}`}
        >
          {mode === "api" ? "DATOS DEL SISTEMA" : "DEMOSTRACIÓN"}
        </span>
      </div>

      <div className="pro-grid">
        <article className="pro-card" aria-label="Corredores anticipados">
          <div className="pro-card__topline">
            <span className="pro-card__symbol pro-card__symbol--prediction">
              PRONÓSTICO
            </span>
            <span className="pro-card__label">Posibles movimientos de corredores</span>
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
                  ? "Sin predicciones registradas."
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
                            : `Corredor ${index + 1}`}
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

        <article className="pro-card" aria-label="Capacidad de refugios">
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

        <article className="pro-card" aria-label="Flota de rescate">
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
                  : "Vehículos informados por el sistema; esto no confirma que haya un rescate en curso."}
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
