import { useEffect, useRef } from "react";

const entries = [
  {
    kind: "walker",
    title: "Zombi caminante",
    color: "orange",
    text: "Avanza una calle cada dos turnos.",
  },
  {
    kind: "runner",
    title: "Zombi corredor",
    color: "orange",
    text: "Avanza dos calles por turno y persigue supervivientes dentro de tres calles.",
  },
  {
    kind: "horde",
    title: "Horda",
    color: "violet",
    text: "Grupo de zombis casi inmóvil que bloquea su nodo y los nodos vecinos. Evita toda esa zona.",
  },
  {
    kind: "dormant",
    title: "Zombi dormido",
    color: "yellow",
    text: "Permanece invisible hasta que un superviviente se acerca a dos calles; después despierta como caminante.",
  },
  {
    kind: "survivor",
    title: "Superviviente",
    color: "green",
    text: "Entidad que busca llegar a un refugio siguiendo la ruta disponible.",
  },
  {
    kind: "shelter",
    title: "Refugio",
    color: "green",
    text: "Punto seguro de destino para los supervivientes.",
  },
  {
    kind: "route",
    title: "Ruta segura recomendada",
    color: "orange",
    text: "Recorrido recomendado para reducir distancia y riesgo.",
  },
  {
    kind: "blocked",
    title: "Calle bloqueada",
    color: "orange",
    text: "Conexión vial no disponible; evita usarla mientras permanezca cerrada.",
  },
];

const shapes = {
  walker:
    '<ellipse cx="11" cy="20" rx="3" ry="5" transform="rotate(-25 11 20)"/><ellipse cx="21" cy="12" rx="3" ry="5" transform="rotate(-25 21 12)"/>',
  runner: '<path d="m18 4 5 5-5 1 1 5-9 9 2-7-6-2 7-5z"/>',
  horde:
    '<path d="M8 9c0-4 3-6 8-6s8 2 8 6v8c0 5-3 7-8 7s-8-2-8-7z"/><circle cx="13" cy="13" r="1.5"/><circle cx="19" cy="13" r="1.5"/>',
  dormant: '<path d="M22 4a9 9 0 1 0 2 17A10 10 0 0 1 22 4Z"/>',
  survivor:
    '<circle cx="16" cy="8" r="3.5"/><path d="M10 24c.4-5 2.4-8 6-8s5.6 3 6 8M16 16v8"/>',
  shelter: '<path d="m4 14 12-9 12 9v11H4z"/><path d="M12 25v-7h8v7"/>',
  route: '<path d="M4 23c6-14 12 4 24-10"/>',
  blocked: '<path d="M5 8h22M5 16h22M5 24h22M9 5v22M23 5v22"/>',
};

function GuideIcon({ kind, color }) {
  return (
    <span className={`guide-icon guide-icon--${color}`} aria-hidden="true">
      <svg viewBox="0 0 32 32">{shapes[kind]}</svg>
    </span>
  );
}

export default function SurvivalGuide({ mode, onClose }) {
  const closeButtonRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const panel = event.currentTarget.querySelector(".guide-panel");
      const focusable = panel?.querySelectorAll(
        'button, [href], select, textarea, input, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="guide-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        className="guide-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="survival-guide-title"
      >
        <header className="guide-panel__header">
          <div>
            <span className="eyebrow">
              SPOOKYTHON 2026 · BRUJAS DE LA NUBE
            </span>
            <h2 id="survival-guide-title">Guía de supervivencia</h2>
          </div>
          <button
            ref={closeButtonRef}
            className="guide-close"
            type="button"
            onClick={onClose}
            aria-label="Cerrar guía"
          >
            ×
          </button>
        </header>
        <p className="guide-source">
          {mode === "demo"
            ? "DEMO · reglas y posiciones ficticias para demostración."
            : "API · reglas visualizadas según el simulador conectado."}
        </p>
        <section className="guide-section">
          <h3>Entidades y señales</h3>
          <div className="guide-entry-list">
            {entries.map((entry) => (
              <article className="guide-entry" key={entry.kind}>
                <GuideIcon kind={entry.kind} color={entry.color} />
                <div>
                  <h4>{entry.title}</h4>
                  <p>{entry.text}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="guide-section">
          <h3>Cómo leer el mapa</h3>
          <p>
            Los marcadores identifican entidades y refugios. Las líneas
            representan rutas solo cuando el simulador entrega geometría válida;
            las zonas circulares señalan el peligro de una horda. Las calles
            bloqueadas aparecen con señal de advertencia y línea discontinua.
          </p>
        </section>
        <section className="guide-section">
          <h3>Cómo sobrevivir</h3>
          <ul>
            <li>Sigue las rutas calculadas y revisa sus cambios.</li>
            <li>Evita las hordas y sus nodos vecinos.</li>
            <li>Presta atención a los corredores por su mayor velocidad.</li>
            <li>Busca el refugio asignado cuando la ruta esté disponible.</li>
          </ul>
        </section>
        <footer className="guide-panel__footer">
          El estado puede actualizarse aproximadamente cada dos segundos, según
          la configuración del simulador. Los datos DEMO son ficticios; los
          datos API dependen de la conexión y del contrato del backend.
        </footer>
      </aside>
    </div>
  );
}
