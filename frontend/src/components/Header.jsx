import ConnectionStatus from "./ConnectionStatus";

export default function Header({
  world,
  mode,
  connection,
  lastUpdated,
  paused,
  onTogglePause,
  onReset,
  elapsed,
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <div
          className="logo-slot"
          aria-label="Mordida Mantense"
          role="img"
        >
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <path d="M24 4 29 18 44 24 29 30 24 44 19 30 4 24l15-6z" />
            <path d="m24 13 3 8 8 3-8 3-3 8-3-8-8-3 8-3z" />
          </svg>
        </div>
        <div>
          <strong>
            MORDIDA <span>MANTENSE</span>
          </strong>
          <small>CENTRO DE OPERACIONES · MANTA, ECUADOR</small>
          <small className="brand__group">
            BRUJAS DE LA NUBE · SPOOKYTHON 2026
          </small>
        </div>
      </div>
      <div className="topbar__metrics">
        <div>
          <span>TURNO</span>
          <strong>{String(world?.turno || 0).padStart(3, "0")}</strong>
        </div>
        <div>
          <span>TIEMPO</span>
          <strong>{elapsed}</strong>
        </div>
        <div>
          <span>SIMULACIÓN</span>
          <strong className={paused ? "text-warning" : "text-success"}>
            {paused ? "PAUSADA" : "ACTIVA"}
          </strong>
        </div>
      </div>
      <div className="topbar__actions">
        <ConnectionStatus
          mode={mode}
          connection={connection}
          lastUpdated={lastUpdated}
        />
        <div className="system-badge">
          <span />{" "}
          {connection === "connected"
            ? mode === "demo"
              ? "DEMO"
              : "OPERATIVO"
            : "DESCONECTADO"}
        </div>
        {mode === "demo" && (
          <button className="button button--ghost" type="button" onClick={onTogglePause}>
            {paused ? "Reanudar" : "Pausar"}
          </button>
        )}
        {mode === "demo" && (
          <button className="button button--ghost" type="button" onClick={onReset}>
            Reiniciar
          </button>
        )}
      </div>
    </header>
  );
}
