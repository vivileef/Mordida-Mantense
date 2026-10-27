import { useEffect, useMemo, useState } from 'react';
import Header from './components/Header';
import StatsPanel from './components/StatsPanel';
import SimulationControls from './components/SimulationControls';
import MantaMap from './components/MantaMap';
import RoutePanel from './components/RoutePanel';
import EventLog from './components/EventLog';
import SurvivalGuide from './components/SurvivalGuide';
import { useWorldState } from './hooks/useWorldState';

export default function App() {
  const [mode, setMode] = useState(import.meta.env.VITE_DATA_MODE === 'api' ? 'api' : 'demo');
  const [paused, setPaused] = useState(false);
  const [selectedId, setSelectedId] = useState('S-0089');
  const [startedAt] = useState(Date.now());
  const { world, connection, error, lastUpdated, reset, refresh, refreshMap, pollInterval } = useWorldState({ demo: mode === 'demo', paused });
  const [elapsed, setElapsed] = useState('00:00');
  const [guideOpen, setGuideOpen] = useState(false);
  const stale = mode === 'api' && lastUpdated && Date.now() - lastUpdated.getTime() > pollInterval * 3;
  useEffect(() => { const timer = window.setInterval(() => { const seconds = Math.floor((Date.now() - startedAt) / 1000); setElapsed(`${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`); }, 1000); return () => window.clearInterval(timer); }, [startedAt]);
  const switchMode = (nextMode) => { setPaused(false); setMode(nextMode); };
  const selectedRoute = useMemo(() => world?.rutas?.find((route) => route.survivorId === selectedId), [world, selectedId]);
  if (!world) return <main className="loading-screen"><div className="logo-slot">LOGO</div><h1>{error ? 'Backend no disponible' : 'Inicializando centro de operaciones'}</h1><p>{error || 'Sincronizando estado del mundo…'}</p><button className="button button--primary" onClick={refresh}>Reintentar conexión</button></main>;
  return <div className="app-shell">
    <Header world={world} mode={mode} connection={connection} lastUpdated={lastUpdated} paused={paused} onTogglePause={() => setPaused((value) => !value)} onReset={reset} elapsed={elapsed} />
    <main className="dashboard">
      <div className="alert-banner"><span className="alert-banner__marker">!</span><strong>{mode === 'demo' ? 'MODO DEMO ACTIVO' : connection === 'connected' ? 'DATOS DEL BACKEND' : 'SIN CONEXIÓN'}</strong><span>{mode === 'demo' ? 'Las posiciones y eventos mostrados son ficticios para demostración.' : stale ? 'Los últimos datos válidos están desactualizados.' : error || `Última actualización: ${lastUpdated?.toLocaleTimeString('es-EC') || 'pendiente'}.`}</span></div>
      <div className="dashboard-actions"><SimulationControls mode={mode} onModeChange={switchMode} paused={paused} onTogglePause={() => setPaused((value) => !value)} onReset={reset} onRefresh={refresh} /><button className="button button--guide" type="button" onClick={() => setGuideOpen(true)}>Guía de supervivencia</button></div>
      <StatsPanel world={world} />
      <div className="workspace"><MantaMap world={world} selectedId={selectedId} onSelect={setSelectedId} mode={mode} connection={connection} lastUpdated={lastUpdated} stale={stale} onRefreshMap={refreshMap} /><aside className="side-column"><RoutePanel world={world} selectedId={selectedId} onSelect={setSelectedId} mode={mode} /><EventLog events={world.eventos} /></aside></div>
      {selectedRoute && <div className="route-detail"><span>RUTA SELECCIONADA</span><strong>{selectedId}</strong><span>INTERSECCIÓN ACTUAL <b>{world.sobrevivientes.find((item) => item.id === selectedId)?.nodo}</b></span><span>DESTINO <b>{world.sobrevivientes.find((item) => item.id === selectedId)?.refugioId}</b></span><span>DISTANCIA Y RIESGO <b>{selectedRoute.distanceRisk || 'pendiente del simulador'}</b></span><span>ESTADO <b>{selectedRoute.status.toUpperCase()}</b></span><span>ÚLTIMA ACTUALIZACIÓN <b>{selectedRoute.updatedAt}</b></span><button className="button button--secondary" type="button" disabled title="El backend aún no expone una operación de recálculo">Recalcular ruta</button></div>}
    </main>
    {guideOpen && <SurvivalGuide mode={mode} onClose={() => setGuideOpen(false)} />}
  </div>;
}
