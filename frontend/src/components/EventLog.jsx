const icons = { peligro: 'ALR', horda: 'HOR', calle: 'VIA', refugio: 'REF', sistema: 'SYS' };
export default function EventLog({ events = [] }) {
  return <section className="panel event-panel"><div className="panel__heading"><h2>Registro de eventos</h2><span className="live-tag">● LIVE</span></div>
    <div className="event-list">{events.slice(0, 8).map((event, index) => <article className="event" key={`${event.turno}-${event.descripcion}-${index}`}>
      <span className={`event__icon event__icon--${event.tipo}`}>{icons[event.tipo] || '•'}</span><div><p>{event.descripcion}</p><small>TURNO {String(event.turno).padStart(3, '0')} · {event.tipo?.toUpperCase() || 'EVENTO'}</small></div>
    </article>)}</div>
  </section>;
}
