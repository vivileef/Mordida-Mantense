import { useState } from "react";

export default function SimulationControls({
  mode,
  onModeChange,
  paused,
  onTogglePause,
  onReset,
  onRefresh,
  onLoadScenario,
  scenarioLoading = false,
  onAdvanceTurn,
  turnLoading = false,
  connection = "connecting",
}) {
  const [scenario, setScenario] = useState("ronda1");

  return (
    <div className="control-strip">
      <div>
        <span className="eyebrow">FUENTE DE DATOS</span>
        <div className="mode-toggle" aria-label="Fuente de datos">
          <button type="button" className={mode === "demo" ? "is-active" : ""} aria-pressed={mode === "demo"} onClick={() => onModeChange("demo")}>DEMO</button>
          <button type="button" className={mode === "api" ? "is-active" : ""} aria-pressed={mode === "api"} onClick={() => onModeChange("api")}>API REAL</button>
        </div>
      </div>
      <div className="control-strip__help">
        {mode === "demo"
          ? "Los movimientos son ficticios y se actualizan cada 2 s."
          : "El estado se actualiza periódicamente. El servidor avanza automáticamente; este control solicita un turno manual."}
      </div>
      <div className="control-strip__buttons">
        {mode === "demo" ? (
          <>
            <button className="button button--primary" type="button" onClick={onTogglePause}>{paused ? "Reanudar" : "Pausar"}</button>
            <button className="button button--secondary" type="button" onClick={onReset}>Reiniciar demo</button>
          </>
        ) : (
          <>
            <label htmlFor="api-scenario">Ronda</label>
            <select id="api-scenario" className="button" value={scenario} onChange={(event) => setScenario(event.target.value)} disabled={scenarioLoading || turnLoading}>
              <option value="ronda1">Ronda 1 · 20 sobrevivientes</option>
              <option value="ronda2">Ronda 2 · 80 sobrevivientes</option>
              <option value="ronda3">Ronda 3 · 200 sobrevivientes</option>
            </select>
            <button className="button button--primary" type="button" onClick={() => onLoadScenario?.(scenario)} disabled={scenarioLoading || turnLoading || connection !== "connected"} title={connection !== "connected" ? "Conecta el backend para iniciar una ronda." : undefined}>
              {scenarioLoading ? "Cargando ronda…" : "Iniciar ronda"}
            </button>
            <button className="button button--secondary" type="button" onClick={onAdvanceTurn} disabled={turnLoading || scenarioLoading || connection !== "connected"} title={connection !== "connected" ? "Conecta el backend para simular un turno." : undefined}>
              {turnLoading ? "Simulando…" : "Simular turno"}
            </button>
            <button className="button button--secondary" type="button" onClick={onRefresh} disabled={turnLoading || scenarioLoading} title="Consultar el estado actual del backend">Actualizar estado</button>
          </>
        )}
      </div>
    </div>
  );
}
