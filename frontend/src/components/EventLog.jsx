import { memo } from "react";
import { createDisplayNames, eventDisplayDescription } from "../utils/presentation";

function eventKind(value) {
  const kind = String(value ?? "").toLowerCase();
  if (["peligro", "danger", "alerta", "amenaza"].includes(kind)) {
    return { label: "Peligro", tone: "peligro" };
  }
  if (["horda", "horde"].includes(kind)) return { label: "Horda", tone: "horda" };
  if (["calle", "street", "bloqueo", "road_block"].includes(kind)) {
    return { label: "Calles", tone: "calle" };
  }
  if (["refugio", "shelter"].includes(kind)) {
    return { label: "Refugio", tone: "refugio" };
  }
  return { label: "Información", tone: "sistema" };
}

const EventLog = memo(function EventLog({
  events = [],
  scheduledEvents = [],
  world = {},
}) {
  const names = createDisplayNames(world);
  const entries = [
    ...events.map((event) => ({ event, scheduled: false })),
    ...scheduledEvents.map((event) => ({ event, scheduled: true })),
  ].sort(
    (first, second) =>
      Number(second.event.turno ?? 0) - Number(first.event.turno ?? 0),
  );

  return (
    <section className="panel event-panel">
      <div className="panel__heading">
        <h2>Registro de eventos</h2>
        <span className="live-tag">ACTUALIZADO</span>
      </div>
      {entries.length === 0 ? (
        <p className="panel-source">
          {world?.camposEstadoAusentes?.includes("eventos")
            ? "Información de eventos no disponible."
            : "No hay eventos para mostrar."}
        </p>
      ) : (
        <div className="event-list" aria-label="Eventos recientes; desplázate para revisar los demás">
          {entries.map(({ event, scheduled }, index) => {
            const kind = eventKind(event.tipo);
            const turn = event.turno;
            return (
              <article
                className={`event event--${kind.tone}`}
                key={`${scheduled ? "scheduled" : "event"}-${event.turno}-${event.descripcion}-${index}`}
              >
                <span className={`event__icon event__icon--${kind.tone}`} aria-hidden="true">
                  {kind.label}
                </span>
                <div>
                  <p>{eventDisplayDescription(event, world, names)}</p>
                  <small>
                    {scheduled ? "Programado" : kind.label}
                    {turn != null && ` · Turno ${turn}`}
                  </small>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
});

export default EventLog;
