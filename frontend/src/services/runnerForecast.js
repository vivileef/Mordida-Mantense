import { isDirectedEdgeBlocked } from "./roadRouting.js";

// Proyección heurística local de amenazas; no representa una predicción del backend.
export function forecastRunnerMovements(world, steps = 3) {
  const zombies = (world?.zombies ?? []).filter((zombie) => zombie.visible !== false);
  return zombies.map((zombie) => {
    let current = String(zombie.nodo ?? zombie.node ?? "");
    let previous = null;
    const predicted = [];
    const type = String(zombie.tipo ?? zombie.type ?? "").toLowerCase();
    if (["horda", "dormido", "sleeper"].includes(type)) {
      return { corredorId: zombie.id, tipo: type, nodosPredichos: predicted };
    }
    for (let step = 0; step < steps; step += 1) {
      const exits = (world?.calles ?? world?.streets ?? [])
        .filter((street) => String(street.origen ?? street.origin) === current)
        .filter((street) => !isDirectedEdgeBlocked(
          world?.aristasBloqueadas ?? world?.blockedEdges,
          current,
          street.destino ?? street.destination,
        ))
        .map((street) => String(street.destino ?? street.destination))
        .filter((id) => id !== previous)
        .sort();
      if (!exits.length) break;
      previous = current;
      current = exits[(Number(world?.turno ?? 0) + step + String(zombie.id ?? "").length) % exits.length];
      predicted.push(current);
    }
    return { corredorId: zombie.id, tipo: type, nodosPredichos: predicted };
  });
}
