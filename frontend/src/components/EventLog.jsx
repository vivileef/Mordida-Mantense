import { memo } from 'react';
import { createDisplayNames, eventDisplayDescription } from '../utils/presentation';

const icons = { peligro: 'ALR', horda: 'HOR', calle: 'VIA', refugio: 'REF', sistema: 'SYS' };
const EventLog = memo(function EventLog({ events = [], scheduledEvents = [], world = {} }) {
  const names = createDisplayNames(world);
  const entries = [
    ...events.map((event) => ({ event, scheduled: false })),
    ...scheduledEvents.map((event) => ({ event, scheduled: true })),
  ].sort((first, second) => Number(first.event.turno ?? 0) - Number(second.event.turno ?? 0));
  return <section className="panel event-panel"><div className="panel__heading"><h2>Registro de eventos</h2><span className="live-tag">● LIVE</span></div>
    {entries.length === 0
      ? <p className="panel-source">{world?.camposEstadoAusentes?.includes('eventos')
          ? 'El estado recibido no incluyó el campo de eventos.'
          : 'No hay eventos publicados en este estado.'}</p>
      : <div className="event-list">{entries.slice(0, 8).map(({ event, scheduled }, index) => <article className="event" key={`${scheduled ? 'scheduled' : 'event'}-${event.turno}-${event.descripcion}-${index}`}>
        <span className={`event__icon event__icon--${event.tipo}`}>{icons[event.tipo] || '•'}</span><div><p>{eventDisplayDescription(event, world, names)}</p><small>{scheduled ? 'PROGRAMADO · ' : ''}TURNO {String(event.turno).padStart(3, '0')} · {event.tipo?.toUpperCase() || 'EVENTO'}</small></div>
      </article>)}</div>}
  </section>;
});

export default EventLog;
