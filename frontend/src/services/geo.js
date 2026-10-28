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
  const nodesInput = world.nodos ?? world.nodes;
  const streetsInput = world.calles ?? world.streets;
  const routesInput = world.rutas ?? world.routes;
  const blockedInput = world.aristasBloqueadas ?? world.blockedEdges;
  const eventsInput = world.eventos ?? world.events;
  const sheltersInput = world.refugios ?? world.refuges;
  const nodes = (Array.isArray(nodesInput) ? nodesInput : []).map(normalizeNode).filter(Boolean);
  const streets = (Array.isArray(streetsInput) ? streetsInput : []).map(normalizeStreet).filter(Boolean);
  const routes = (Array.isArray(routesInput) ? routesInput : []).map(normalizeRoute).filter(Boolean);
  const camposEstadoAusentes = [
    ["sobrevivientes", world.sobrevivientes ?? world.survivors],
    ["rutas", routesInput],
    ["aristasBloqueadas", blockedInput],
    ["eventos", eventsInput],
    ["refugios", sheltersInput],
  ].filter(([, value]) => !Array.isArray(value)).map(([field]) => field);

  return {
    ...world,
    turno: world.turno ?? world.turn ?? 0,
    nodos: nodes,
    calles: streets,
    rutas: routes,
    aristasBloqueadas: (Array.isArray(blockedInput) ? blockedInput : [])
      .filter((edge) => Array.isArray(edge) && edge.length >= 2)
      .map((edge) => edge.map(String)),
    eventos: Array.isArray(eventsInput) ? eventsInput : [],
    eventosProgramados: Array.isArray(world.eventosProgramados) ? world.eventosProgramados : [],
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
    refugios: (Array.isArray(sheltersInput) ? sheltersInput : []).map((refuge) => ({
      ...refuge,
      nodo: String(refuge.nodo ?? refuge.node ?? ""),
      capacidad: refuge.capacidad ?? refuge.capacity,
    })),
    camposEstadoAusentes,
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

function correspondingLocalStreet(apiStreet, candidates) {
  if (candidates.length <= 1) return candidates[0] ?? null;

  const apiName = String(apiStreet.nombre ?? apiStreet.name ?? "").trim();
  const hasUsefulName = apiName && !/^calle sin nombre$/i.test(apiName);
  let matches = hasUsefulName
    ? candidates.filter((street) => String(street.nombre ?? street.name ?? "").trim() === apiName)
    : candidates;
  if (matches.length > 1) {
    const apiType = apiStreet.tipo ?? apiStreet.type;
    if (apiType != null) {
      const sameType = matches.filter((street) =>
        String(street.tipo ?? street.type) === String(apiType),
      );
      if (sameType.length > 0) matches = sameType;
    }
  }
  if (matches.length > 1) {
    const apiDistance = Number(apiStreet.distancia_m ?? apiStreet.distance_m ?? apiStreet.distance);
    if (Number.isFinite(apiDistance)) {
      const sameDistance = matches.filter((street) =>
        Math.abs(Number(street.distancia_m ?? street.distance_m ?? street.distance) - apiDistance) < 0.01,
      );
      if (sameDistance.length > 0) matches = sameDistance;
    }
  }
  if (matches.length === 1) return matches[0];
  if (matches.length > 1 && matches.every((street) => geometriesMatch(street, matches[0]))) {
    return matches[0];
  }
  return null;
}

/**
 * Reuses local road geometry only after the API graph's nodes and directed
 * connections have been verified against the local network. Existing API
 * geometries remain authoritative; ambiguous local parallel edges are not guessed.
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
  let ambiguousGeometry = 0;
  const calles = api.calles.map((street) => {
    const key = directedStreetKey(street.origen, street.destino);
    const localCandidates = localStreetGroups.get(key) ?? [];
    const localStreet = correspondingLocalStreet(street, localCandidates);
    if (!localStreet) {
      const apiGeometry = geometryToPositions(
        street.geometry ?? street.geometria ?? street.coordinates ?? street.coordenadas,
      );
      if (apiGeometry.length < 2 && localCandidates.length > 1) ambiguousGeometry += 1;
      return street;
    }

    const apiGeometry = geometryToPositions(
      street.geometry ?? street.geometria ?? street.coordinates ?? street.coordenadas,
    );
    const localGeometry = geometryToPositions(
      localStreet.geometry ?? localStreet.geometria ?? localStreet.coordinates ?? localStreet.coordenadas,
    );
    if (apiGeometry.length > 1) {
      if (localGeometry.length > 1 && !geometriesMatch(street, localStreet)) {
        differentGeometry += 1;
      }
      // Valid API geometry remains authoritative when it is available.
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
      `La geometría API difiere de la red local en ${differentGeometry} calles compatibles; se conserva la geometría entregada por la API.`,
    );
  }
  if (ambiguousGeometry > 0) {
    warnings.push(
      `${ambiguousGeometry} calles API sin geometría coinciden con conexiones paralelas ambiguas; no se eligió geometría local para esos tramos.`,
    );
  }
  return { nodos: api.nodos, calles, compatible, warnings };
}

export function geometryToPositions(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Feature") return geometryToPositions(geometry.geometry);
  if (geometry.type === "LineString") {
    const coordinates = geometry.coordinates ?? [];
    if (!Array.isArray(coordinates) || coordinates.length < 2) return [];
    const valid = coordinates.every((point) =>
      Array.isArray(point) && point.length >= 2 &&
      Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1])) &&
      Math.abs(Number(point[0])) <= 180 && Math.abs(Number(point[1])) <= 90,
    );
    return valid ? coordinates.map(([lng, lat]) => [Number(lat), Number(lng)]) : [];
  }
  if (geometry.type === "MultiLineString") {
    const lines = geometry.coordinates ?? [];
    if (!Array.isArray(lines) || lines.length === 0) return [];
    const paths = lines.map((line) => geometryToPositions({ type: "LineString", coordinates: line }));
    if (paths.some((path) => path.length < 2)) return [];
    const merged = [...paths[0]];
    for (const path of paths.slice(1)) {
      const end = merged[merged.length - 1];
      const startsAtEnd = end[0] === path[0][0] && end[1] === path[0][1];
      const endsAtEnd = end[0] === path.at(-1)[0] && end[1] === path.at(-1)[1];
      if (!startsAtEnd && !endsAtEnd) return [];
      const ordered = startsAtEnd ? path : [...path].reverse();
      merged.push(...ordered.slice(1));
    }
    return merged;
  }
  const points = geometry.coordinates ?? geometry;
  if (!Array.isArray(points)) return [];
  const positions = points.map((point) => {
    if (Array.isArray(point) && point.length >= 2 && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]))) {
      return [Number(point[0]), Number(point[1])];
    }
    if (point && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng))) {
      return [Number(point.lat), Number(point.lng)];
    }
    return null;
  });
  return positions.length > 1 && positions.every(Boolean) ? positions : [];
}

export function streetGeometry(street, nodeMap, { allowEndpointFallback = false } = {}) {
  const explicit = geometryToPositions(street.geometry ?? street.geometria ?? street.coordinates ?? street.coordenadas);
  if (explicit.length > 1) return explicit;
  if (!allowEndpointFallback) return [];
  const origin = nodeMap.get(street.origen);
  const destination = nodeMap.get(street.destino);
  return origin && destination ? [origin, destination] : [];
}

export function uniqueStreetPaths(streets, nodeMap) {
  const seen = new Set();
  const paths = [];

  (Array.isArray(streets) ? streets : []).forEach((street, index) => {
    const path = streetGeometry(street, nodeMap);
    if (path.length < 2) return;

    const forward = JSON.stringify(path);
    const reverse = JSON.stringify([...path].reverse());
    const geometryKey = forward <= reverse ? forward : reverse;
    const key = `${edgeKey(street.origen, street.destino)}|${geometryKey}`;
    if (seen.has(key)) return;

    seen.add(key);
    paths.push({ street, path, index });
  });

  return paths;
}

function explicitStreetGeometry(street) {
  return geometryToPositions(
    street.geometry ?? street.geometria ?? street.coordinates ?? street.coordenadas,
  );
}

function streetCandidates(value) {
  const streets = Array.isArray(value) ? value : value ? [value] : [];
  return streets.map((street) => ({ street }));
}

function mappedStreetGeometry(origin, destination, streetMap, routeStreet) {
  const candidates = streetCandidates(streetMap.get(`${origin}|${destination}`));
  if (candidates.length === 0) return [];

  const routeName = String(routeStreet?.nombre ?? routeStreet?.name ?? "").trim();
  const hasRouteName = routeName && !/^calle sin nombre$/i.test(routeName);
  const namedCandidates = hasRouteName
    ? candidates.filter(({ street }) =>
        String(street.nombre ?? street.name ?? "").trim() === routeName,
      )
    : candidates;
  if (hasRouteName && namedCandidates.length === 0) return [];

  const withGeometry = namedCandidates.flatMap(({ street }) => {
    const positions = explicitStreetGeometry(street);
    if (positions.length < 2) return [];
    return [{ positions }];
  });
  if (withGeometry.length === 0) return [];

  const uniquePaths = new Map(
    withGeometry.map(({ positions }) => [JSON.stringify(positions), positions]),
  );
  // With parallel roads, node IDs alone cannot identify which geometry the
  // route uses. Draw only when the route's street name disambiguates it or
  // every candidate has the same geometry.
  return uniquePaths.size === 1 ? uniquePaths.values().next().value : [];
}

export function routeGeometry(route, nodeMap, streetMap) {
  const routeNodes = route.nodes ?? route.nodos ?? [];
  if (Array.isArray(routeNodes) && routeNodes.length > 1) {
    const positions = [];
    const routeStreets = route.streets ?? route.calles ?? [];
    for (let index = 0; index < routeNodes.length - 1; index += 1) {
      const origin = String(routeNodes[index]);
      const destination = String(routeNodes[index + 1]);
      if (!nodeMap.has(origin) || !nodeMap.has(destination)) return [];
      const hasConnection = streetMap.has(`${origin}|${destination}`);
      if (!hasConnection) return [];
      const routeStreet = routeStreets[index]
        ? normalizeStreet(routeStreets[index])
        : null;
      if (routeStreets[index] && !routeStreet) return [];
      if (routeStreet && !(
        routeStreet.origen === origin && routeStreet.destino === destination
      )) return [];
      let segment = mappedStreetGeometry(
        origin,
        destination,
        streetMap,
        routeStreet,
      );
      if (segment.length < 2 && routeStreet) {
        segment = explicitStreetGeometry(routeStreet);
      }
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
      if (!nodeMap.has(street.origen) || !nodeMap.has(street.destino)) return [];
      if (!streetMap.has(`${street.origen}|${street.destino}`)) return [];
      const mappedSegment = mappedStreetGeometry(
        street.origen,
        street.destino,
        streetMap,
        street,
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
