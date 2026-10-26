import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import { useEffect, useState } from 'react';
import { center } from '../data/demoWorld';

const colors = {
  caminante: '#8fa19b',
  walker: '#8fa19b',
  corredor: '#ff6b35',
  runner: '#ff6b35',
  horda: '#c084fc',
  horde: '#c084fc',
  dormido: '#355c9b',
  dormant: '#355c9b',
};
const labels = {
  caminante: 'Walker / Caminante',
  walker: 'Walker / Caminante',
  corredor: 'Runner / Corredor',
  runner: 'Runner / Corredor',
  horda: 'Horde / Horda',
  horde: 'Horde / Horda',
  dormido: 'Dormant / Dormido',
  dormant: 'Dormant / Dormido',
};
function FitMap({ nodes }) {
  const map = useMap();
  useEffect(() => { if (nodes?.length) map.fitBounds(nodes.map((node) => [node.lat, node.lng]), { padding: [30, 30] }); }, [map, nodes]);
  return null;
}
function coordinates(world) {
  return new Map((world?.nodos || []).map((node) => [node.id, [node.lat, node.lng]]));
}
function lineFor(ids, nodeMap) {
  return ids.map((id) => nodeMap.get(id)).filter(Boolean);
}
export default function MantaMap({ world, selectedId, onSelect }) {
  const [layers, setLayers] = useState({
    survivors: true,
    zombies: true,
    shelters: true,
    blocked: true,
    routes: true,
  });
  const nodeMap = coordinates(world);
  const toggleLayer = (layer) => setLayers((current) => ({ ...current, [layer]: !current[layer] }));
  return <section className="map-panel">
    <div className="map-label"><span className="pulse" /> MAPA TÁCTICO · MANTA <small>POSICIONES DEMO</small></div>
    <div className="map-controls" aria-label="Capas del mapa">
      {[
        ['survivors', 'Sobrevivientes'],
        ['zombies', 'Zombies'],
        ['shelters', 'Refugios'],
        ['routes', 'Rutas'],
        ['blocked', 'Calles bloqueadas'],
      ].map(([layer, label]) => <button
        className={layers[layer] ? 'is-visible' : ''}
        key={layer}
        type="button"
        aria-pressed={layers[layer]}
        onClick={() => toggleLayer(layer)}
      >{layers[layer] ? '●' : '○'} {label}</button>)}
    </div>
    <MapContainer center={center} zoom={14} scrollWheelZoom className="leaflet-map">
      <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <FitMap nodes={world?.nodos} />
      {(world?.calles || []).map((street, index) => {
        const path = lineFor([street.origen, street.destino], nodeMap);
        const blocked = (world.aristasBloqueadas || []).some((edge) => edge.includes(street.origen) && edge.includes(street.destino));
        if (blocked && !layers.blocked) return null;
        return <Polyline key={`street-${index}`} positions={path} pathOptions={{ color: blocked ? '#ef4444' : '#26343d', weight: blocked ? 5 : 2, dashArray: blocked ? '8 8' : undefined, opacity: blocked ? 0.9 : 0.65 }} />;
      })}
      {layers.routes && (world?.rutas || []).map((route) => <Polyline key={`route-${route.survivorId}`} positions={lineFor(route.nodes, nodeMap)} pathOptions={{ color: route.survivorId === selectedId ? '#54d6df' : '#398b91', weight: route.survivorId === selectedId ? 5 : 3, dashArray: route.status === 'invalida' ? '5 8' : undefined }} />)}
      {layers.zombies && (world?.zombies || []).filter((zombie) => zombie.visible !== false).map((zombie) => {
        const position = nodeMap.get(zombie.nodo);
        if (!position) return null;
        const type = String(zombie.tipo || '').toLowerCase();
        const color = colors[type] || colors.caminante;
        const isHorde = type === 'horda' || type === 'horde';
        return <CircleMarker center={position} radius={isHorde ? 13 : 8} pathOptions={{ color, fillColor: color, fillOpacity: 0.88, weight: 2 }} key={zombie.id}><Popup><b>{zombie.id}</b><br />Tipo: {labels[type] || zombie.tipo}<br />Nodo: {zombie.nodo}{zombie.cantidad ? <><br />Grupo: {zombie.cantidad}</> : null}</Popup></CircleMarker>;
      })}
      {layers.survivors && (world?.sobrevivientes || []).map((survivor) => {
        const position = nodeMap.get(survivor.nodo);
        if (!position) return null;
        return <CircleMarker center={position} radius={selectedId === survivor.id ? 9 : 7} pathOptions={{ color: '#061116', fillColor: survivor.activo ? '#54d6df' : '#7b8790', fillOpacity: 1, weight: 3 }} key={survivor.id} eventHandlers={{ click: () => onSelect(survivor.id) }}><Popup><b>{survivor.id}</b><br />Estado: {survivor.activo ? 'en camino' : 'eliminado'}<br />Nodo: {survivor.nodo}<br />Destino: {survivor.refugioId}</Popup></CircleMarker>;
      })}
      {layers.shelters && (world?.refugios || []).map((shelter) => {
        const position = nodeMap.get(shelter.nodo);
        return position ? <CircleMarker center={position} radius={11} pathOptions={{ color: '#8be28b', fillColor: '#1e6b50', fillOpacity: 0.95, weight: 3 }} key={shelter.id}><Popup><b>⌂ {shelter.id}</b><br />Refugio disponible<br />Nodo: {shelter.nodo}</Popup></CircleMarker> : null;
      })}
    </MapContainer>
    <div className="map-legend"><span><i className="legend-dot legend-dot--survivor" /> Sobreviviente</span><span><i className="legend-dot legend-dot--walker" /> Walker</span><span><i className="legend-dot legend-dot--runner" /> Runner</span><span><i className="legend-dot legend-dot--horde" /> Horde</span><span><i className="legend-dot legend-dot--dormant" /> Dormant</span><span><i className="legend-dot legend-dot--shelter" /> Refugio</span><span><i className="legend-line" /> Calle bloqueada</span><span><i className="legend-route" /> Ruta de escape</span></div>
  </section>;
}
