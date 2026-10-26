const statDefinitions = [
  ['Sobrevivientes activos', 'survivors', 'SUP', 'safe'],
  ['Mordidos / eliminados', 'lost', 'BAJ', 'alert'],
  ['Zombies totales', 'zombies', 'ZOM', 'alert'],
  ['Caminantes', 'walkers', 'WAL', 'neutral'],
  ['Corredores', 'runners', 'RUN', 'orange'],
  ['Hordas', 'hordes', 'HOR', 'dark'],
  ['Dormidos', 'sleepers', 'DOR', 'muted'],
  ['Refugios disponibles', 'shelters', 'REF', 'safe'],
  ['Calles bloqueadas', 'blocked', 'VIA', 'orange'],
];

export function getStats(world) {
  const zombies = world?.zombies || [];
  const survivors = world?.sobrevivientes || [];
  return {
    survivors: survivors.filter((item) => item.activo).length,
    lost: survivors.filter((item) => !item.activo).length,
    zombies: zombies.length,
    walkers: zombies.filter((item) => item.tipo === 'caminante').length,
    runners: zombies.filter((item) => item.tipo === 'corredor').length,
    hordes: zombies.filter((item) => item.tipo === 'horda').length,
    sleepers: zombies.filter((item) => item.tipo === 'dormido').length,
    shelters: (world?.refugios || []).length,
    blocked: (world?.aristasBloqueadas || []).length,
  };
}

export default function StatsPanel({ world }) {
  const stats = getStats(world);
  return <section className="stats-grid" aria-label="Estadísticas de la simulación">
    {statDefinitions.map(([label, key, icon, tone]) => <article className={`stat-card stat-card--${tone}`} key={key}>
      <span className="stat-card__icon">{icon}</span><div><span>{label}</span><strong>{stats[key]}</strong></div>
    </article>)}
  </section>;
}
