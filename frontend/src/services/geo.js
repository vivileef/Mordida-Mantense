export function normalizeNode(node) {
  if (!node || node.id == null) return null;
  const lat = Number(node.lat ?? node.latitude);
  const lng = Number(node.lng ?? node.lon ?? node.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }

  return {
    ...node,
    id: String(node.id),
    lat,
    lng,
    nombre: node.nombre ?? node.name ?? `Intersección ${node.id}`,
  };
}

export function normalizeStreet(street) {
  if (!street) return null;
  const origen = street.origen ?? street.origin ?? street.from;
  const destino = street.destino ?? street.destination ?? street.to;
  if (origen == null || destino == null) return null;

  return {
    ...street,
    origen: String(origen),
    destino: String(destino),
    nombre: street.nombre ?? street.name ?? "calle sin nombre",
    tipo: street.tipo ?? street.type ?? "calle",
    distancia_m: Number(street.distancia_m ?? street.distance_m ?? street.distance) || undefined,
  };
}

export function normalizeRoute(route) {
  if (!route) return null;
  const nodes = route.nodes ?? route.nodos ?? route.path;
  return {
    ...route,
    survivorId: String(route.survivorId ?? route.sobrevivienteId ?? route.survivienteId ?? ""),
    refugeId: route.refugeId ?? route.refugioId ?? null,
    nodes: Array.isArray(nodes) ? nodes.map(String) : [],
    status: route.status ?? (nodes?.length ? "activa" : "invalida"),
    streets: route.streets ?? route.calles ?? [],
    alternatives: route.alternatives ?? route.alternativas ?? [],
  };
}

export function normalizeWorld(world) {
  if (!world || typeof world !== "object") throw new Error("El estado del mundo no es válido.");
  const nodes = (world.nodos ?? world.nodes ?? []).map(normalizeNode).filter(Boolean);
  const streets = (world.calles ?? world.streets ?? []).map(normalizeStreet).filter(Boolean);
  const routes = (world.rutas ?? world.routes ?? []).map(normalizeRoute).filter(Boolean);

  return {
    ...world,
    turno: world.turno ?? world.turn ?? 0,
    nodos: nodes,
    calles: streets,
    rutas: routes,
    aristasBloqueadas: (world.aristasBloqueadas ?? world.blockedEdges ?? []).map((edge) => edge.map(String)),
    zombies: (world.zombies ?? []).map((zombie) => ({
      ...zombie,
      nodo: String(zombie.nodo ?? zombie.node ?? ""),
      tipo: zombie.tipo ?? zombie.type,
    })),
    sobrevivientes: (world.sobrevivientes ?? world.survivors ?? []).map((survivor) => ({
      ...survivor,
      nodo: String(survivor.nodo ?? survivor.node ?? ""),
      refugioId: survivor.refugioId ?? survivor.refugeId,
      activo: survivor.activo ?? survivor.active ?? true,
    })),
    refugios: (world.refugios ?? world.refuges ?? []).map((refuge) => ({
      ...refuge,
      nodo: String(refuge.nodo ?? refuge.node ?? ""),
      capacidad: refuge.capacidad ?? refuge.capacity,
    })),
  };
}

export function normalizeMap(map) {
  if (!map || typeof map !== "object") throw new Error("El mapa no es válido.");
  return {
    nodos: (map.nodos ?? map.nodes ?? []).map(normalizeNode).filter(Boolean),
    calles: (map.calles ?? map.streets ?? []).map(normalizeStreet).filter(Boolean),
  };
}

function directedStreetKey(origin, destination) {
  return `${String(origin)}|${String(destination)}`;
}

function groupStreets(streets) {
  const groups = new Map();
  for (const street of streets) {
    const key = directedStreetKey(street.origen, street.destino);
    const group = groups.get(key) ?? [];
    group.push(street);
    groups.set(key, group);
  }
  return groups;
}

function geometriesMatch(first, second) {
  const firstPositions = geometryToPositions(first.geometry ?? first.geometria ?? first.coordinates ?? first.coordenadas);
  const secondPositions = geometryToPositions(second.geometry ?? second.geometria ?? second.coordinates ?? second.coordenadas);
  return firstPositions.length === secondPositions.length &&
    firstPositions.length > 1 &&
    firstPositions.every(([lat, lng], index) =>
      Math.abs(lat - secondPositions[index][0]) <= 1e-7 &&
      Math.abs(lng - secondPositions[index][1]) <= 1e-7,
    );
}

/**
 * Reuses local road geometry only after the API graph's nodes and directed
 * connections have been verified against the local network. Existing API
 * geometries are compared and any local replacement is reported as a warning.
 */
export function resolveRoadMap(apiMap, localMap) {
  const api = normalizeMap(apiMap ?? {});
  const local = normalizeMap(localMap ?? {});
  const warnings = [];
  const apiNodes = new Map(api.nodos.map((node) => [node.id, node]));
  const localNodes = new Map(local.nodos.map((node) => [node.id, node]));
  const sameNodeIds =
    apiNodes.size === localNodes.size &&
    [...apiNodes.keys()].every((id) => localNodes.has(id));
  const sameNodeCoordinates =
    sameNodeIds &&
    [...apiNodes].every(([id, node]) => {
      const localNode = localNodes.get(id);
      return Math.abs(node.lat - localNode.lat) <= 1e-7 &&
        Math.abs(node.lng - localNode.lng) <= 1e-7;
    });

  if (!sameNodeIds) {
    warnings.push(
      `La red API tiene ${apiNodes.size} nodos y la red local ${localNodes.size}; sus IDs no coinciden completamente. No se reutilizó geometría local.`,
    );
  } else if (!sameNodeCoordinates) {
    warnings.push(
      "Las coordenadas de algunos nodos API difieren de la red local. No se reutilizó geometría local.",
    );
  }

  const apiStreetGroups = groupStreets(api.calles);
  const localStreetGroups = groupStreets(local.calles);
  const sameConnections =
    apiStreetGroups.size === localStreetGroups.size &&
    [...apiStreetGroups].every(([key, streets]) =>
      localStreetGroups.get(key)?.length === streets.length,
    );
  if (!sameConnections) {
    warnings.push(
      "Las conexiones dirigidas de /mapa difieren de la red local. No se reutilizó geometría local.",
    );
  }

  const compatible = sameNodeIds && sameNodeCoordinates && sameConnections;
  if (!compatible) {
    return { nodos: api.nodos, calles: api.calles, compatible, warnings };
  }

  let reusedGeometry = 0;
  let differentGeometry = 0;
  const occurrenceByEdge = new Map();
  const calles = api.calles.map((street) => {
    const key = directedStreetKey(street.origen, street.destino);
    const occurrence = occurrenceByEdge.get(key) ?? 0;
    occurrenceByEdge.set(key, occurrence + 1);
    const localStreet = localStreetGroups.get(key)?.[occurrence];
    if (!localStreet) return street;

    const apiGeometry = geometryToPositions(
      street.geometry ?? street.geometria ?? street.coordinates ?? street.coordenadas,
    );
    const localGeometry = geometryToPositions(
      localStreet.geometry ?? localStreet.geometria ?? localStreet.coordinates ?? localStreet.coordenadas,
    );
    if (apiGeometry.length > 1) {
      if (localGeometry.length > 1 && !geometriesMatch(street, localStreet)) {
        differentGeometry += 1;
        return {
          ...street,
          geometry: localStreet.geometry ?? localStreet.geometria ?? localStreet.coordinates ?? localStreet.coordenadas,
        };
      }
      return street;
    }
    if (localGeometry.length > 1) {
      reusedGeometry += 1;
      return {
        ...street,
        geometry: localStreet.geometry ?? localStreet.geometria ?? localStreet.coordinates ?? localStreet.coordenadas,
      };
    }
    return street;
  });

  if (reusedGeometry > 0) {
    warnings.push(
      `/mapa omitió o entregó geometría inválida en ${reusedGeometry} calles compatibles; se reutilizó geometría local tras verificar nodos y conexiones.`,
    );
  }
  if (differentGeometry > 0) {
    warnings.push(
      `La geometría API difiere de la red local en ${differentGeometry} calles compatibles; se usa la geometría local y se conserva la ruta del backend.`,
    );
  }
  return { nodos: api.nodos, calles, compatible, warnings };
}

export function geometryToPositions(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Feature") return geometryToPositions(geometry.geometry);
  if (geometry.type === "LineString") {
    return (geometry.coordinates ?? [])
      .filter((point) => Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1])))
      .map(([lng, lat]) => [Number(lat), Number(lng)]);
  }
  if (geometry.type === "MultiLineString") {
    return (geometry.coordinates ?? []).flatMap((line) => geometryToPositions({ type: "LineString", coordinates: line }));
  }
  const points = geometry.coordinates ?? geometry;
  if (!Array.isArray(points)) return [];
  return points.map((point) => {
    if (Array.isArray(point) && point.length >= 2 && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]))) {
      return [Number(point[0]), Number(point[1])];
    }
    if (point && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng))) {
      return [Number(point.lat), Number(point.lng)];
    }
    return null;
  }).filter(Boolean);
}

export function streetGeometry(street, nodeMap, { allowEndpointFallback = true } = {}) {
  const explicit = geometryToPositions(street.geometry ?? street.geometria ?? street.coordinates ?? street.coordenadas);
  if (explicit.length > 1) return explicit;
  if (!allowEndpointFallback) return [];
  const origin = nodeMap.get(street.origen);
  const destination = nodeMap.get(street.destino);
  return origin && destination ? [origin, destination] : [];
}

function explicitStreetGeometry(street) {
  return geometryToPositions(
    street.geometry ?? street.geometria ?? street.coordinates ?? street.coordenadas,
  );
}

function mappedStreetGeometry(origin, destination, streetMap) {
  const direct = streetMap.get(`${origin}|${destination}`);
  const directGeometry = direct && explicitStreetGeometry(direct);
  if (directGeometry?.length > 1) return directGeometry;

  const reverse = streetMap.get(`${destination}|${origin}`);
  const reverseGeometry = reverse && explicitStreetGeometry(reverse);
  return reverseGeometry?.length > 1 ? [...reverseGeometry].reverse() : [];
}

export function routeGeometry(route, nodeMap, streetMap) {
  const routeNodes = route.nodes ?? route.nodos ?? [];
  if (Array.isArray(routeNodes) && routeNodes.length > 1) {
    const positions = [];
    for (let index = 0; index < routeNodes.length - 1; index += 1) {
      const segment = mappedStreetGeometry(
        String(routeNodes[index]),
        String(routeNodes[index + 1]),
        streetMap,
      );
      if (segment.length < 2) return [];
      positions.push(...(index ? segment.slice(1) : segment));
    }
    return positions.length > 1 ? positions : [];
  }

  const routeStreets = route.streets ?? route.calles ?? [];
  if (Array.isArray(routeStreets) && routeStreets.length > 0) {
    const positions = [];
    for (let index = 0; index < routeStreets.length; index += 1) {
      const street = normalizeStreet(routeStreets[index]);
      if (!street) return [];
      const mappedSegment = mappedStreetGeometry(
        street.origen,
        street.destino,
        streetMap,
      );
      const segment = mappedSegment.length > 1
        ? mappedSegment
        : explicitStreetGeometry(street);
      if (segment.length < 2) return [];
      positions.push(...(index ? segment.slice(1) : segment));
    }
    return positions.length > 1 ? positions : [];
  }

  return geometryToPositions(
    route.geometry ?? route.geometria ?? route.coordinates ?? route.coordenadas,
  );
}

export function edgeKey(origin, destination) {
  return [String(origin), String(destination)].sort().join("|");
}

export function isBlocked(world, street) {
  const key = edgeKey(street.origen, street.destino);
  return (world.aristasBloqueadas ?? []).some((edge) => edgeKey(edge[0], edge[1]) === key);
}
