export default function SimulationControls({ mode, onModeChange, paused, onTogglePause, onReset, onRefresh }) {
  return <div className="control-strip">
    <div><span className="eyebrow">FUENTE DE DATOS</span><div className="mode-toggle">
      <button className={mode === 'demo' ? 'is-active' : ''} onClick={() => onModeChange('demo')}>DEMO</button>
      <button className={mode === 'api' ? 'is-active' : ''} onClick={() => onModeChange('api')}>API REAL</button>
    </div></div>
    <div className="control-strip__help">{mode === 'demo' ? 'Los movimientos son ficticios y se actualizan cada 2 s.' : 'GET /estado se actualiza periódicamente; el mapa se conserva hasta refrescarlo.'}</div>
    <div className="control-strip__buttons">
      {mode === 'demo' && <button className="button button--primary" onClick={onTogglePause}>{paused ? 'Reanudar' : 'Pausar'}</button>}
      {mode === 'demo' && <button className="button button--secondary" onClick={onReset}>Reiniciar demo</button>}
      {mode === 'api' && <button className="button button--secondary" onClick={onRefresh}>Actualizar</button>}
    </div>
  </div>;
}
