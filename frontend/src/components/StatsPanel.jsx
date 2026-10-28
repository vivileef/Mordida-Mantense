import { memo } from "react";
import {
  intersectionDisplayName,
  streetDisplayName,
} from "../utils/presentation";

const statDefinitions = [
  ["Personas", "people", "safe", "👥", "En seguimiento"],
  ["Zombis", "zombies", "alert", "🧟", "Amenazas detectadas"],
  ["Calles bloqueadas", "blocked", "orange", "🚧", "Tramos afectados"],
  ["Rutas y refugios", "routes", "purple", "🧭", "Plan de evacuación"],
];

export function getStats(world) {
  const zombies = world?.zombies || [];
  const survivors = world?.sobrevivientes || [];
  const refuges = world?.refugios || [];
  const activeSurvivors = survivors.filter((item) => item.activo).length;
  const arrivedSurvivors = survivors.filter((survivor) => {
    const destinationId = survivor.refugioId ?? survivor.refugeId;
    if (destinationId == null || survivor.nodo == null) return false;
    const refuge = refuges.find(
      (item) => String(item.id ?? item.refugioId) === String(destinationId),
    );
    const refugeNode = refuge?.nodo ?? refuge?.node;
    return refugeNode != null && String(survivor.nodo) === String(refugeNode);
  }).length;
  return {
    activeSurvivors,
    inactiveSurvivors: survivors.filter((item) => !item.activo).length,
    arrivedSurvivors,
    zombies: zombies.length,
    walkers: zombies.filter((item) => ["caminante", "walker"].includes(String(item.tipo).toLowerCase())).length,
    runners: zombies.filter((item) => ["corredor", "runner"].includes(String(item.tipo).toLowerCase())).length,
    hordes: zombies.filter((item) => ["horda", "horde"].includes(String(item.tipo).toLowerCase())).length,
    sleepers: zombies.filter((item) => ["dormido", "dormant"].includes(String(item.tipo).toLowerCase())).length,
    blocked: (world?.aristasBloqueadas || []).length,
    routes: (world?.rutas || []).length,
    refuges: (world?.refugios || []).length,
  };
}

function blockedRoadNames(world) {
  const nodes = new Map(
    (world?.nodos || []).map((node) => [String(node.id), node]),
  );
  const streets = world?.calles || [];
  return (world?.aristasBloqueadas || [])
    .filter((edge) => Array.isArray(edge) && edge.length >= 2)
    .map(([origin, destination]) => {
      const street = streets.find(
        (item) =>
          String(item.origen) === String(origin) &&
          String(item.destino) === String(destination),
      );
      const from = intersectionDisplayName(nodes.get(String(origin)), streets);
      const to = intersectionDisplayName(nodes.get(String(destination)), streets);
      if (street && streetDisplayName(street) !== "Calle sin nombre") {
        return `${streetDisplayName(street)} · ${from} → ${to}`;
      }
      return `${from} → ${to}`;
    });
}

function routeCounts(routes) {
  return (routes || []).reduce(
    (counts, route) => {
      const status = String(route.status ?? "").toLowerCase().replaceAll("_", "-");
      if (["sin-ruta", "unavailable", "invalid", "invalida", "blocked", "bloqueada"].includes(status) || route.bloqueada === true) {
        counts.unavailable += 1;
      } else if (["alternative", "alternativa"].includes(status) || route.alternativa === true) {
        counts.alternative += 1;
      } else if (["active", "activa", "safe", "segura"].includes(status)) {
        counts.active += 1;
      } else {
        counts.published += 1;
      }
      return counts;
    },
    { active: 0, alternative: 0, unavailable: 0, published: 0 },
  );
}

const StatsPanel = memo(function StatsPanel({ world }) {
  const stats = getStats(world);
  const missing = world?.camposEstadoAusentes ?? [];
  const unavailable = {
    people: missing.includes("sobrevivientes"),
    zombies: missing.includes("zombies"),
    blocked: missing.includes("aristasBloqueadas"),
    routes: missing.includes("rutas"),
    refuges: missing.includes("refugios"),
  };
  const blockedNames = blockedRoadNames(world);
  const counts = routeCounts(world?.rutas);
  const refugesText = unavailable.refuges
    ? "Refugios: información no disponible"
    : `Refugios registrados: ${stats.refuges}`;

  return (
    <section className="stats-grid" aria-label="Resumen operativo">
      {statDefinitions.map(([label, key, tone, icon, hint]) => (
        <article className={`stat-card stat-card--${tone}`} key={key}>
          <div className="stat-card__heading">
            <span className="stat-card__icon" aria-hidden="true">{icon}</span>
            <span className="stat-card__title-group">
              <span className="stat-card__title">{label}</span>
              <small>{hint}</small>
            </span>
          </div>
          <div className="stat-card__content">
            <strong className="stat-card__metric">
              {unavailable[key]
                ? "—"
                : key === "people"
                  ? stats.activeSurvivors
                  : key === "zombies"
                    ? stats.zombies
                    : key === "blocked"
                      ? stats.blocked
                      : stats.routes}
            </strong>
            {key === "people" && !unavailable.people && (
              <div className="stat-card__details">
                <span><b>{stats.arrivedSurvivors}</b> llegaron a refugio</span>
                <span><b>{stats.inactiveSurvivors}</b> fuera de actividad</span>
              </div>
            )}
            {key === "zombies" && !unavailable.zombies && (
              <div className="stat-card__details stat-card__details--grid">
                <span>Caminantes <b>{stats.walkers}</b></span>
                <span>Corredores <b>{stats.runners}</b></span>
                <span>Hordas <b>{stats.hordes}</b></span>
                <span>Dormidos <b>{stats.sleepers}</b></span>
              </div>
            )}
            {key === "blocked" && !unavailable.blocked && (
              <>
                <div className="stat-card__details">
                  {blockedNames.length === 0 ? "Sin calles bloqueadas" : "Tramos afectados:"}
                </div>
                {blockedNames.length > 0 && (
                  <ul
                    className="stat-card__list"
                    aria-label="Calles bloqueadas"
                    tabIndex={0}
                  >
                    {blockedNames.map((road, index) => (
                      <li key={`${road}-${index}`}>{road}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {key === "routes" && !unavailable.routes && (
              <div className="stat-card__details stat-card__details--grid">
                <span>Activas <b>{counts.active}</b></span>
                <span>Alternativas <b>{counts.alternative}</b></span>
                <span>Publicadas <b>{counts.published}</b></span>
                <span>No disponibles <b>{counts.unavailable}</b></span>
              </div>
            )}
            {unavailable[key] && (
              <div className="stat-card__details">
                Información no disponible
              </div>
            )}
            {key === "routes" && (
              <div className="stat-card__footer">{refugesText}</div>
            )}
          </div>
        </article>
      ))}
    </section>
  );
});

export default StatsPanel;
