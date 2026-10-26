export default function RoutePanel({ world, selectedId, onSelect }) {
  const routes = world?.rutas || [];
  const survivors = world?.sobrevivientes || [];
  return <section className="panel route-panel"><div className="panel__heading"><h2>Rutas de escape</h2><span className="panel-count">{routes.length} PLANES</span></div>
    <div className="route-list">{routes.map((route) => {
      const survivor = survivors.find((item) => item.id === route.survivorId);
      return <button className={`route-card ${selectedId === route.survivorId ? 'is-selected' : ''}`} key={route.survivorId} onClick={() => onSelect(route.survivorId)}>
        <div className="route-card__top"><strong>{route.survivorId}</strong><span className={`status-pill status-pill--${route.status}`}>{route.status === 'invalida' ? '⚠ INVALIDADA' : '● ACTIVA'}</span></div>
        <div className="route-card__data"><span>NODO <b>{survivor?.nodo || '—'}</b></span><span>DESTINO <b>{survivor?.refugioId || '—'}</b></span><span>NODOS <b>{route.nodes.length}</b></span></div>
        <small>Actualizada {route.updatedAt || 'recientemente'}</small>
      </button>;
    })}</div>
  </section>;
}
