import ConnectionStatus from './ConnectionStatus';

export default function Header({ world, mode, connection, lastUpdated, paused, onTogglePause, onReset, elapsed }) {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="logo-slot" aria-label="Espacio reservado para el logo de Brujas de la Noche">
          LOGO
        </div>
        <div><strong>MORDIDA <span>MANTENSE</span></strong><small>CENTRO DE OPERACIONES · MANTA, ECUADOR</small><small className="brand__group">BRUJAS DE LA NOCHE · SPOOKYTHON 2026</small></div>
      </div>
      <div className="topbar__metrics">
        <div><span>TURNO</span><strong>{String(world?.turno || 0).padStart(3, '0')}</strong></div>
        <div><span>TIEMPO</span><strong>{elapsed}</strong></div>
        <div><span>SIMULACIÓN</span><strong className={paused ? 'text-warning' : 'text-success'}>{paused ? 'PAUSADA' : 'ACTIVA'}</strong></div>
      </div>
      <div className="topbar__actions">
        <ConnectionStatus mode={mode} connection={connection} lastUpdated={lastUpdated} />
        <div className="system-badge"><span /> {connection === 'connected' ? (mode === 'demo' ? 'DEMO' : 'OPERATIVO') : 'DESCONECTADO'}</div>
        {mode === 'demo' && <button className="button button--ghost" onClick={onTogglePause}>{paused ? 'Reanudar' : 'Pausar'}</button>}
        {mode === 'demo' && <button className="button button--ghost" onClick={onReset}>Reiniciar</button>}
      </div>
    </header>
  );
}
