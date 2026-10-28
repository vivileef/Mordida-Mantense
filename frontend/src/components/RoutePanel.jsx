import { memo } from 'react';
import {
  createDisplayNames,
  displayEntityName,
  intersectionDisplayName,
} from '../utils/presentation';

const RoutePanel = memo(function RoutePanel({ world, selectedId, onSelect, mode = 'demo' }) {
  const routes = world?.rutas || [];
  const survivors = world?.sobrevivientes || [];
  const names = createDisplayNames(world);
  return <section className="panel route-panel"><div className="panel__heading"><h2>Rutas de escape</h2><span className="panel-count">{routes.length} PLANES</span></div>
    <p className="panel-source">{mode === 'demo' ? 'Rutas ficticias; sin trazado vial real.' : routes.length ? 'Rutas entregadas por el backend; solo se dibujan con geometría vial.' : 'El backend no entregó rutas completas.'}</p>
    <div className="route-list">{routes.map((route) => {
      const survivorId = route.survivorId ?? route.sobrevivienteId;
      const survivor = survivors.find((item) => String(item.id) === String(survivorId));
      const routeNodes = route.nodes ?? route.nodos ?? [];
      const currentNode = world?.nodos?.find((node) => String(node.id) === String(survivor?.nodo));
      return <button className={`route-card ${selectedId === survivorId ? 'is-selected' : ''}`} key={survivorId} onClick={() => onSelect(survivorId)}>
        <div className="route-card__top"><strong>{displayEntityName(names, 'survivors', survivorId, 'Sobreviviente')}</strong><span className={`status-pill status-pill--${route.status}`}>{route.status === 'invalida' ? '⚠ INVALIDADA' : '● ACTIVA'}</span></div>
        <div className="route-card__data"><span>INTERSECCIÓN <b>{currentNode ? intersectionDisplayName(currentNode, world?.calles || []) : '—'}</b></span><span>DESTINO <b>{displayEntityName(names, 'shelters', survivor?.refugioId, 'Refugio')}</b></span><span>INTERSECCIONES <b>{routeNodes.length || '—'}</b></span></div>
        <span className="route-card__risk">DISTANCIA Y RIESGO: {route.distanceRisk || 'pendiente del simulador'}</span>
        <small>Actualizada {route.updatedAt || 'recientemente'}</small>
      </button>;
    })}</div>
  </section>;
});

export default RoutePanel;
