import { useMemo, useState } from "react";
import { dispatchRescue } from "../services/simulatorApi";

export default function ProFeaturesPanel({ world, mode, onRefresh }) {
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const predictions = world?.prediccionesCorredores ?? [];
  const vehicles = world?.rescate?.vehiculos ?? [];
  const assignments = world?.rescate?.asignaciones ?? [];
  const fullRefuges = useMemo(
    () => (world?.refugios ?? []).filter((refuge) => refuge.lleno),
    [world?.refugios],
  );

  if (mode !== "api") return null;

  const handleDispatch = async () => {
    setLoading(true);
    setFeedback("");
    try {
      const result = await dispatchRescue();
      setFeedback(`${result.asignaciones?.length ?? 0} personas priorizadas para rescate.`);
      await onRefresh();
    } catch (error) {
      setFeedback(error.message || "No se pudo preparar el rescate.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="pro-panel" aria-label="Funciones avanzadas">
      <div className="pro-panel__header">
        <div>
          <span className="eyebrow">NIVEL PRO</span>
          <h2>Predicción y rescate</h2>
        </div>
        <button className="button button--primary" type="button" onClick={handleDispatch} disabled={loading}>
          {loading ? "Planificando…" : "Despachar flota"}
        </button>
      </div>
      <div className="pro-grid">
        <article>
          <strong>Corredores anticipados</strong>
          <span>{predictions.length ? `${predictions.length} amenazas proyectadas` : "Sin corredores activos"}</span>
          {predictions.slice(0, 3).map((prediction) => (
            <p key={prediction.corredorId}>
              {prediction.corredorId}: {prediction.nodosPredichos.join(" → ")}
            </p>
          ))}
        </article>
        <article>
          <strong>Capacidad de refugios</strong>
          <span>{fullRefuges.length ? `${fullRefuges.length} refugio(s) lleno(s)` : "Capacidad disponible"}</span>
          <p>{(world?.refugios ?? []).map((refuge) => `${refuge.id}: ${refuge.ocupados ?? 0}/${refuge.capacidad ?? "—"}`).join(" · ")}</p>
        </article>
        <article>
          <strong>Flota de rescate</strong>
          <span>5 camionetas · 4 personas · 2x velocidad</span>
          <p>{vehicles.map((vehicle) => `${vehicle.id}: ${vehicle.status}`).join(" · ")}</p>
          {assignments.length > 0 && <p>{assignments.length} asignaciones activas</p>}
        </article>
      </div>
      {feedback && <p className="pro-panel__feedback" role="status">{feedback}</p>}
    </section>
  );
}
