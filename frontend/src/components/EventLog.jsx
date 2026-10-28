import { memo } from 'react';
import { createDisplayNames, eventDisplayDescription } from '../utils/presentation';

const icons = { peligro: 'ALR', horda: 'HOR', calle: 'VIA', refugio: 'REF', sistema: 'SYS' };
const EventLog = memo(function EventLog({ events = [], world = {} }) {
  const names = createDisplayNames(world);
  return <section className="panel event-panel"><div className="panel__heading"><h2>Registro de eventos</h2><span className="live-tag">● LIVE</span></div>
    <div className="event-list">{events.slice(0, 8).map((event, index) => <article className="event" key={`${event.turno}-${event.descripcion}-${index}`}>
      <span className={`event__icon event__icon--${event.tipo}`}>{icons[event.tipo] || '•'}</span><div><p>{eventDisplayDescription(event, world, names)}</p><small>TURNO {String(event.turno).padStart(3, '0')} · {event.tipo?.toUpperCase() || 'EVENTO'}</small></div>
    </article>)}</div>
  </section>;
});

export default EventLog;
