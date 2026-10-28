import { memo, useMemo } from 'react';
import {
  createDisplayNames,
  displayEntityName,
  intersectionDisplayName,
} from '../utils/presentation';

const RoutePanel = memo(function RoutePanel({ world, selectedId, onSelect, mode = 'demo', routeLookup }) {
  const routes = world?.rutas || [];
  const names = useMemo(() => createDisplayNames(world), [
    world?.sobrevivientes,
    world?.refugios,
  ]);
  const survivorsById = useMemo(
    () => new Map((world?.sobrevivientes || []).map((item) => [String(item.id), item])),
    [world?.sobrevivientes],
  );
  const nodesById = useMemo(
    () => new Map((world?.nodos || []).map((item) => [String(item.id), item])),
    [world?.nodos],
  );
  const sourceDescription = world?.rutasCalculadasLocalmente
    ? mode === 'api'
      ? 'Rutas recalculadas localmente para probar bloqueos; no se envian al backend.'
      : 'Rutas simuladas sobre las geometrias viales disponibles.'
    : mode === 'demo'
    ? 'Rutas simuladas sobre las geometrías viales disponibles.'
    : routes.length
      ? 'Rutas entregadas por el backend; solo se dibujan con geometría vial compatible.'
      : routeLookup?.status === 'loading'
        ? 'Consultando la ruta del sobreviviente seleccionado en el backend.'
        : routeLookup?.status === 'unavailable'
          ? 'El backend no encontró una ruta segura para el sobreviviente seleccionado.'
          : routeLookup?.status === 'error'
            ? `No se pudo consultar la ruta del backend: ${routeLookup.error}`
            : world?.camposEstadoAusentes?.includes('rutas')
              ? 'GET /estado no incluye una lista de rutas; se consulta GET /ruta para la persona seleccionada.'
              : 'No hay rutas publicadas para este estado.';

  return (
    <section className="panel route-panel">
      <div className="panel__heading">
        <h2>Rutas de escape</h2>
        <span className="panel-count">{routes.length} PLANES</span>
      </div>
      <p className="panel-source">{sourceDescription}</p>
      <div className="route-list">
        {routes.map((route, index) => {
          const survivorId = route.survivorId ?? route.sobrevivienteId;
          const survivor = survivorsById.get(String(survivorId));
          const routeNodes = route.nodes ?? route.nodos ?? [];
          const currentNodeId = survivor?.nodo ?? routeNodes[0];
          const nextNodeId = routeNodes[1];
          const currentNode = nodesById.get(String(currentNodeId));
          const nextNode = nodesById.get(String(nextNodeId));
          const destinationId = route.refugeId ?? route.refugioId ?? survivor?.refugioId;
          const noRoute = route.status === 'sin_ruta' || route.status === 'unavailable';
          const invalid = noRoute || route.status === 'invalida' || route.status === 'invalid';
          const routeStatus = noRoute
            ? 'SIN RUTA DISPONIBLE'
            : route.status == null
              ? 'PUBLICADA'
            : invalid
              ? 'INVALIDADA'
              : String(route.status).toLocaleUpperCase('es-EC');
          const distanceMeters = Number(route.distancia_m ?? route.distance_m);
          const distanceDescription = route.distanceRisk ?? (
            Number.isFinite(distanceMeters)
              ? `${Math.round(distanceMeters)} m`
              : route.distanciaNodos != null
                ? `${route.distanciaNodos} tramos`
                : 'No informados'
          );

          return (
            <button
              className={`route-card ${String(selectedId) === String(survivorId) ? 'is-selected' : ''}`}
              key={survivorId ?? `route-${index}`}
              type="button"
              aria-pressed={String(selectedId) === String(survivorId)}
              onClick={() => survivorId != null && onSelect(String(survivorId))}
              disabled={survivorId == null}
            >
              <div className="route-card__top">
                <strong>{displayEntityName(names, 'survivors', survivorId, 'Sobreviviente')}</strong>
                <span className={`status-pill status-pill--${invalid ? 'invalida' : 'activa'}`}>
                  {invalid ? '⚠ ' : '● '}{routeStatus}
                </span>
              </div>
              <div className="route-card__data">
                <span>UBICACIÓN <b>{currentNode ? intersectionDisplayName(currentNode, world?.calles || []) : 'No disponible'}</b></span>
                <span>SIGUIENTE PASO <b>{nextNode ? intersectionDisplayName(nextNode, world?.calles || []) : 'No publicado'}</b></span>
                <span>DESTINO <b>{displayEntityName(names, 'shelters', destinationId, 'Refugio')}</b></span>
                <span>INTERSECCIONES <b>{routeNodes.length || '—'}</b></span>
              </div>
              <span className="route-card__risk">DISTANCIA / RIESGO: {distanceDescription}</span>
              {route.updatedAt && <small>Actualizada {route.updatedAt}</small>}
            </button>
          );
        })}
      </div>
    </section>
  );
});

export default RoutePanel;
