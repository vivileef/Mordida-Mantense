export function directedEdgeKey(origin, destination) {
  return `${String(origin)}\u0000${String(destination)}`;
}

function validPair(edge) {
  return Array.isArray(edge) && edge.length >= 2 && edge[0] != null && edge[1] != null;
}

export function isDirectedEdgeBlocked(edges, origin, destination) {
  const key = directedEdgeKey(origin, destination);
  return (edges ?? []).some((edge) => validPair(edge) && directedEdgeKey(edge[0], edge[1]) === key);
}

export function hasDirectedConnection(world, origin, destination) {
  const nodes = new Set((world?.nodos ?? []).map((node) => String(node.id)));
  const from = String(origin);
  const to = String(destination);
  return nodes.has(from) && nodes.has(to) &&
    (world?.calles ?? []).some((street) =>
      String(street.origen) === from && String(street.destino) === to,
    );
}

export function applyBlockOverrides(serverEdges = [], overrides = []) {
  const result = [];
  const seen = new Set();
  for (const edge of serverEdges) {
    if (!validPair(edge)) continue;
    const [origin, destination] = edge.map(String);
    const key = directedEdgeKey(origin, destination);
    if (!seen.has(key)) {
      seen.add(key);
      result.push([origin, destination]);
    }
  }

  for (const override of overrides) {
    if (!override || override.origen == null || override.destino == null) continue;
    const origin = String(override.origen);
    const destination = String(override.destino);
    const key = directedEdgeKey(origin, destination);
    const existingIndex = result.findIndex((edge) => directedEdgeKey(edge[0], edge[1]) === key);
    if (existingIndex >= 0) result.splice(existingIndex, 1);
    seen.delete(key);
    if (override.bloqueada === true) {
      result.push([origin, destination]);
      seen.add(key);
    }
  }
  return result;
}

export function updateBlockOverrides(world, overrides, origin, destination, blocked) {
  if (!hasDirectedConnection(world, origin, destination)) {
    return { ok: false, overrides, blockedEdges: null, changed: false };
  }

  const from = String(origin);
  const to = String(destination);
  const baseBlocked = isDirectedEdgeBlocked(world.aristasBloqueadas, from, to);
  const currentBlocked = isDirectedEdgeBlocked(
    applyBlockOverrides(world.aristasBloqueadas, overrides)
      .map((edge) => edge.map(String)),
    from,
    to,
  );
  const nextOverrides = (overrides ?? []).filter((item) =>
    directedEdgeKey(item.origen, item.destino) !== directedEdgeKey(from, to),
  );
  if (baseBlocked !== Boolean(blocked)) {
    nextOverrides.push({ origen: from, destino: to, bloqueada: Boolean(blocked) });
  }
  return {
    ok: true,
    overrides: nextOverrides,
    blockedEdges: applyBlockOverrides(world.aristasBloqueadas, nextOverrides),
    changed: currentBlocked !== Boolean(blocked),
  };
}

export function setWorldEdgeBlocked(world, origin, destination, blocked) {
  if (!hasDirectedConnection(world, origin, destination)) {
    return { ok: false, changed: false, world };
  }

  const from = String(origin);
  const to = String(destination);
  const currentBlocked = isDirectedEdgeBlocked(world.aristasBloqueadas, from, to);
  if (currentBlocked === Boolean(blocked)) return { ok: true, changed: false, world };

  const edges = (world.aristasBloqueadas ?? [])
    .filter(validPair)
    .map((edge) => edge.map(String))
    .filter((edge) => directedEdgeKey(edge[0], edge[1]) !== directedEdgeKey(from, to));
  if (blocked) edges.push([from, to]);

  const nextWorld = { ...world, aristasBloqueadas: edges };
  return { ok: true, changed: true, world: recalculateWorldRoutes(nextWorld) };
}

class MinHeap {
  items = [];

  push(item) {
    this.items.push(item);
    let index = this.items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.items[parent].distance <= item.distance) break;
      this.items[index] = this.items[parent];
      index = parent;
    }
    this.items[index] = item;
  }

  pop() {
    if (!this.items.length) return null;
    const first = this.items[0];
    const last = this.items.pop();
    if (this.items.length && last) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        if (left >= this.items.length) break;
        const child = right < this.items.length &&
          this.items[right].distance < this.items[left].distance ? right : left;
        if (this.items[child].distance >= last.distance) break;
        this.items[index] = this.items[child];
        index = child;
      }
      this.items[index] = last;
    }
    return first;
  }
}

function graphFor(world, blockedEdges) {
  const nodes = new Set((world?.nodos ?? []).map((node) => String(node.id)));
  const graph = new Map([...nodes].map((node) => [node, []]));
  for (const street of world?.calles ?? []) {
    const origin = String(street.origen ?? "");
    const destination = String(street.destino ?? "");
    const weight = Number(street.distancia_m);
    if (!nodes.has(origin) || !nodes.has(destination) ||
        !Number.isFinite(weight) || weight <= 0 ||
        isDirectedEdgeBlocked(blockedEdges, origin, destination)) continue;
    graph.get(origin).push({ destination, weight, street });
  }
  return graph;
}

export function findShortestRoute(world, start, destination, blockedEdges = world?.aristasBloqueadas ?? []) {
  const origin = String(start ?? "");
  const target = String(destination ?? "");
  const graph = graphFor(world, blockedEdges);
  if (!graph.has(origin) || !graph.has(target)) return null;
  if (origin === target) return { nodes: [origin], streets: [], distance_m: 0 };

  const distances = new Map([[origin, 0]]);
  const previous = new Map();
  const pending = new MinHeap();
  pending.push({ node: origin, distance: 0 });

  while (pending.items.length) {
    const current = pending.pop();
    if (current.distance !== distances.get(current.node)) continue;
    if (current.node === target) break;
    for (const edge of graph.get(current.node) ?? []) {
      const candidate = current.distance + edge.weight;
      if (candidate >= (distances.get(edge.destination) ?? Infinity)) continue;
      distances.set(edge.destination, candidate);
      previous.set(edge.destination, { node: current.node, street: edge.street });
      pending.push({ node: edge.destination, distance: candidate });
    }
  }

  if (!distances.has(target)) return null;
  const nodes = [target];
  const streets = [];
  let current = target;
  while (current !== origin) {
    const step = previous.get(current);
    if (!step) return null;
    streets.unshift(step.street);
    nodes.unshift(step.node);
    current = step.node;
  }
  return { nodes, streets, distance_m: distances.get(target) };
}

export function recalculateWorldRoutes(world, blockedEdges = world?.aristasBloqueadas ?? []) {
  const survivors = world?.sobrevivientes ?? [];
  const shelters = world?.refugios ?? [];
  const routes = [...(world?.rutas ?? [])];
  const warnings = [];
  const hasSurvivorData = Array.isArray(world?.sobrevivientes) &&
    !world?.camposEstadoAusentes?.includes("sobrevivientes");
  const hasShelterData = Array.isArray(world?.refugios) &&
    !world?.camposEstadoAusentes?.includes("refugios");

  if (!hasSurvivorData || !hasShelterData) {
    warnings.push("No se pueden recalcular rutas localmente: el estado no incluye sobrevivientes y refugios compatibles.");
  }

  const saveRoute = (route) => {
    const index = routes.findIndex((item) =>
      String(item.survivorId ?? item.sobrevivienteId) === String(route.survivorId),
    );
    if (index >= 0) routes[index] = route;
    else routes.push(route);
  };

  for (const survivor of survivors) {
    if (survivor.activo === false) continue;
    const shelter = shelters.find((item) =>
      String(item.id) === String(survivor.refugioId ?? survivor.refugeId),
    );
    if (!shelter) {
      warnings.push(`No se puede recalcular a ${survivor.id ?? "un sobreviviente"}: falta su refugio en el estado.`);
      saveRoute({
        ...(routes.find((item) => String(item.survivorId ?? item.sobrevivienteId) === String(survivor.id)) ?? {}),
        survivorId: String(survivor.id),
        nodes: [],
        streets: [],
        distance_m: null,
        status: "sin_ruta",
        recalculadaLocalmente: true,
      });
      continue;
    }
    const plan = findShortestRoute(world, survivor.nodo ?? survivor.node, shelter.nodo ?? shelter.node, blockedEdges);
    const route = {
      ...(routes.find((item) => String(item.survivorId ?? item.sobrevivienteId) === String(survivor.id)) ?? {}),
      survivorId: String(survivor.id),
      refugeId: String(shelter.id),
      nodes: plan?.nodes ?? [],
      streets: plan?.streets ?? [],
      distance_m: plan?.distance_m ?? null,
      status: plan ? "activa" : "sin_ruta",
      recalculadaLocalmente: true,
    };
    saveRoute(route);
  }

  const activeSurvivorIds = new Set(
    survivors.filter((survivor) => survivor.activo !== false).map((survivor) => String(survivor.id)),
  );
  for (const route of routes) {
    const routeSurvivorId = String(route.survivorId ?? route.sobrevivienteId ?? "");
    if (activeSurvivorIds.has(routeSurvivorId)) continue;
    const nodes = route.nodes ?? route.nodos;
    if (!Array.isArray(nodes) || nodes.length < 2) continue;
    const invalidated = nodes.slice(0, -1).some((origin, index) => {
      const destination = nodes[index + 1];
      return isDirectedEdgeBlocked(blockedEdges, origin, destination) ||
        !hasDirectedConnection(world, origin, destination);
    });
    if (invalidated) {
      const reason = hasSurvivorData
        ? "no se puede validar el sobreviviente"
        : "el estado no incluye sobrevivientes";
      warnings.push(`No se pudo recalcular la ruta de ${routeSurvivorId || "un sobreviviente"}: ${reason} y la ruta recibida cruza un tramo bloqueado o inexistente.`);
      Object.assign(route, {
        nodes: [],
        streets: [],
        distance_m: null,
        status: "sin_ruta",
        recalculadaLocalmente: true,
      });
    }
  }

  return { ...world, rutas: routes, advertenciasRutasLocales: warnings };
}
