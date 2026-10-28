import test from "node:test";
import assert from "node:assert/strict";
import {
  edgeKey,
  geometryToPositions,
  isBlocked,
  normalizeWorld,
  resolveRoadMap,
  routeGeometry,
  streetGeometry,
  uniqueStreetPaths,
} from "../src/services/geo.js";

const nodes = [
  { id: "A", lat: -0.5, lng: -80.1 },
  { id: "B", lat: -0.6, lng: -80.2 },
  { id: "C", lat: -0.7, lng: -80.3 },
];
const nodeMap = new Map(nodes.map((node) => [node.id, [node.lat, node.lng]]));
const streets = [
  { origen: "A", destino: "B", geometry: { type: "LineString", coordinates: [[-80.1, -0.5], [-80.15, -0.55], [-80.2, -0.6]] } },
  { origen: "B", destino: "C", geometry: { type: "LineString", coordinates: [[-80.2, -0.6], [-80.25, -0.65], [-80.3, -0.7]] } },
];
const streetMap = new Map(streets.map((street) => [`${street.origen}|${street.destino}`, street]));

test("converts GeoJSON longitude/latitude to Leaflet latitude/longitude", () => {
  assert.deepEqual(
    geometryToPositions(streets[0].geometry),
    [[-0.5, -80.1], [-0.55, -80.15], [-0.6, -80.2]],
  );
});

test("rejects malformed line points instead of bridging across them", () => {
  assert.deepEqual(geometryToPositions({
    type: "LineString",
    coordinates: [[-80.1, -0.5], ["invalid", -0.55], [-80.2, -0.6]],
  }), []);
});

test("joins connected MultiLineString parts and rejects disconnected parts", () => {
  const connected = { type: "MultiLineString", coordinates: [
    [[-80.1, -0.5], [-80.2, -0.6]],
    [[-80.3, -0.7], [-80.2, -0.6]],
  ] };
  const disconnected = { type: "MultiLineString", coordinates: [
    [[-80.1, -0.5], [-80.2, -0.6]],
    [[-80.4, -0.8], [-80.5, -0.9]],
  ] };
  assert.deepEqual(geometryToPositions(connected), [[-0.5, -80.1], [-0.6, -80.2], [-0.7, -80.3]]);
  assert.deepEqual(geometryToPositions(disconnected), []);
});

test("routes preserve backend node order and use each existing street geometry", () => {
  assert.deepEqual(routeGeometry({ nodes: ["A", "B", "C"] }, nodeMap, streetMap), [
    [-0.5, -80.1], [-0.55, -80.15], [-0.6, -80.2], [-0.65, -80.25], [-0.7, -80.3],
  ]);
});

test("routes with missing nodes or missing graph connections are not drawn", () => {
  assert.deepEqual(routeGeometry({ nodes: ["A", "MISSING"] }, nodeMap, streetMap), []);
  assert.deepEqual(routeGeometry({ nodes: ["A", "C"] }, nodeMap, streetMap), []);
  assert.deepEqual(routeGeometry({
    streets: [{ origen: "A", destino: "C", geometry: streets[0].geometry }],
  }, nodeMap, streetMap), []);
});

test("does not use a reverse-only edge to draw a route against one-way direction", () => {
  const reverseOnly = {
    ...streets[0],
    origen: "B",
    destino: "A",
    geometry: {
      type: "LineString",
      coordinates: [...streets[0].geometry.coordinates].reverse(),
    },
  };
  const directedStreetMap = new Map([["B|A", [reverseOnly]]]);

  assert.deepEqual(routeGeometry({ nodes: ["A", "B"] }, nodeMap, directedStreetMap), []);
  assert.deepEqual(
    routeGeometry({ nodes: ["B", "A"] }, nodeMap, directedStreetMap),
    [[-0.6, -80.2], [-0.55, -80.15], [-0.5, -80.1]],
  );
});

test("route street names disambiguate parallel roads without inventing a choice", () => {
  const avenue = {
    origen: "A",
    destino: "B",
    nombre: "Avenida Central",
    geometry: { type: "LineString", coordinates: [[-80.1, -0.5], [-80.16, -0.54], [-80.2, -0.6]] },
  };
  const serviceRoad = {
    origen: "A",
    destino: "B",
    nombre: "Calle lateral",
    geometry: { type: "LineString", coordinates: [[-80.1, -0.5], [-80.14, -0.56], [-80.2, -0.6]] },
  };
  const parallelStreetMap = new Map([["A|B", [avenue, serviceRoad]]]);

  assert.deepEqual(routeGeometry({ nodes: ["A", "B"] }, nodeMap, parallelStreetMap), []);
  assert.deepEqual(
    routeGeometry({
      nodes: ["A", "B"],
      streets: [{ origen: "A", destino: "B", nombre: "Calle lateral" }],
    }, nodeMap, parallelStreetMap),
    [[-0.5, -80.1], [-0.56, -80.14], [-0.6, -80.2]],
  );
  assert.deepEqual(
    routeGeometry({
      nodes: ["A", "B"],
      streets: [{ origen: "B", destino: "C", nombre: "Calle lateral" }],
    }, nodeMap, parallelStreetMap),
    [],
  );
});

test("street geometry does not invent a straight line when geometry is absent", () => {
  assert.deepEqual(streetGeometry({ origen: "A", destino: "B" }, nodeMap), []);
  assert.deepEqual(
    streetGeometry({ origen: "A", destino: "B" }, nodeMap, { allowEndpointFallback: true }),
    [nodeMap.get("A"), nodeMap.get("B")],
  );
});

test("draws a reciprocal street geometry once while preserving distinct parallel geometry", () => {
  const reverseStreet = {
    ...streets[0],
    origen: "B",
    destino: "A",
    geometry: {
      type: "LineString",
      coordinates: [...streets[0].geometry.coordinates].reverse(),
    },
  };
  const parallelStreet = {
    ...streets[0],
    nombre: "Calle paralela",
    geometry: {
      type: "LineString",
      coordinates: [[-80.1, -0.5], [-80.16, -0.54], [-80.2, -0.6]],
    },
  };

  const result = uniqueStreetPaths([streets[0], reverseStreet, parallelStreet], nodeMap);

  assert.equal(result.length, 2);
  assert.deepEqual(result.map(({ index }) => index), [0, 2]);
});

test("blocked edges match regardless of direction", () => {
  const world = { aristasBloqueadas: [["B", "A"]] };
  assert.equal(isBlocked(world, streets[0]), true);
  assert.equal(edgeKey("A", "B"), edgeKey("B", "A"));
});

test("API/local compatibility refuses to copy geometry across different node IDs", () => {
  const local = { nodos: nodes, calles: streets };
  const api = {
    nodos: nodes.map((node) => ({ ...node, id: `API-${node.id}` })),
    calles: streets.map((street) => ({ ...street, origen: `API-${street.origen}`, destino: `API-${street.destino}` })),
  };
  const result = resolveRoadMap(api, local);
  assert.equal(result.compatible, false);
  assert.ok(result.warnings.length > 0);
  assert.deepEqual(result.calles.map((street) => street.geometry), api.calles.map((street) => street.geometry));
});

test("preserves valid API geometry and warns when it differs from the compatible local network", () => {
  const apiGeometry = {
    type: "LineString",
    coordinates: [[-80.1, -0.5], [-80.17, -0.53], [-80.2, -0.6]],
  };
  const result = resolveRoadMap({
    nodos: nodes,
    calles: [{ ...streets[0], geometry: apiGeometry }, streets[1]],
  }, { nodos: nodes, calles: streets });

  assert.equal(result.compatible, true);
  assert.equal(result.calles[0].geometry, apiGeometry);
  assert.ok(result.warnings.some((warning) => warning.includes("se conserva la geometría entregada por la API")));
});

test("reuses a named local parallel edge only when node and connection compatibility is proven", () => {
  const namedAvenue = { ...streets[0], nombre: "Avenida Central" };
  const secondStreet = {
    ...streets[0],
    nombre: "Calle lateral",
    geometry: { type: "LineString", coordinates: [[-80.1, -0.5], [-80.14, -0.56], [-80.2, -0.6]] },
  };
  const apiStreets = [
    { ...namedAvenue, geometry: undefined },
    { ...secondStreet, geometry: undefined },
    streets[1],
  ];
  const result = resolveRoadMap({ nodos: nodes, calles: apiStreets }, {
    nodos: nodes,
    calles: [namedAvenue, secondStreet, streets[1]],
  });

  assert.equal(result.compatible, true);
  assert.deepEqual(result.calles.map((street) => street.geometry), [
    namedAvenue.geometry,
    secondStreet.geometry,
    streets[1].geometry,
  ]);
});

test("normalizes API routes and blocked edge IDs without changing the sequence", () => {
  const world = normalizeWorld({
    zombies: [],
    sobrevivientes: [],
    rutas: [{ sobrevivienteId: "S-1", nodos: ["A", "B", "C"] }],
    aristasBloqueadas: [["B", "A"]],
    eventosProgramados: [{ turno: 10, tipo: "calle", descripcion: "Cierre programado" }],
  });
  assert.deepEqual(world.rutas[0].nodes, ["A", "B", "C"]);
  assert.deepEqual(world.aristasBloqueadas, [["B", "A"]]);
  assert.equal(world.eventosProgramados[0].turno, 10);
});

test("distinguishes omitted state collections from explicitly empty collections", () => {
  const world = normalizeWorld({ zombies: [], sobrevivientes: [], refugios: [] });

  assert.deepEqual(world.rutas, []);
  assert.deepEqual(world.aristasBloqueadas, []);
  assert.deepEqual(world.eventos, []);
  assert.deepEqual(world.camposEstadoAusentes, ["rutas", "aristasBloqueadas", "eventos"]);

  const explicitEmpty = normalizeWorld({
    zombies: [],
    sobrevivientes: [],
    refugios: [],
    rutas: [],
    aristasBloqueadas: [],
    eventos: [],
  });
  assert.deepEqual(explicitEmpty.camposEstadoAusentes, []);
});
