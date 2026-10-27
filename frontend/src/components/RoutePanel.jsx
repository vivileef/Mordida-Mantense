export default function RoutePanel({ world, selectedId, onSelect, mode = 'demo' }) {
  const routes = world?.rutas || [];
  const survivors = world?.sobrevivientes || [];
  return <section className="panel route-panel"><div className="panel__heading"><h2>Rutas de escape</h2><span className="panel-count">{routes.length} PLANES</span></div>
    <p className="panel-source">{mode === 'demo' ? 'Rutas ficticias; sin trazado vial real.' : routes.length ? 'Rutas entregadas por el backend; solo se dibujan con geometría vial.' : 'El backend no entregó rutas completas.'}</p>
    <div className="route-list">{routes.map((route) => {
      const survivor = survivors.find((item) => item.id === route.survivorId);
      const routeNodes = Array.isArray(route.nodes) ? route.nodes : [];
      return <button className={`route-card ${selectedId === route.survivorId ? 'is-selected' : ''}`} key={route.survivorId} onClick={() => onSelect(route.survivorId)}>
        <div className="route-card__top"><strong>{route.survivorId}</strong><span className={`status-pill status-pill--${route.status}`}>{route.status === 'invalida' ? '⚠ INVALIDADA' : '● ACTIVA'}</span></div>
        <div className="route-card__data"><span>INTERSECCIÓN <b>{survivor?.nodo || '—'}</b></span><span>DESTINO <b>{survivor?.refugioId || '—'}</b></span><span>INTERSECCIONES <b>{routeNodes.length || '—'}</b></span></div>
        <span className="route-card__risk">DISTANCIA Y RIESGO: {route.distanceRisk || 'pendiente del simulador'}</span>
        <small>Actualizada {route.updatedAt || 'recientemente'}</small>
      </button>;
    })}</div>
  </section>;
}
