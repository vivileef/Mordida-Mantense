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

test("street geometry does not invent a straight line when geometry is absent", () => {
  assert.deepEqual(streetGeometry({ origen: "A", destino: "B" }, nodeMap), []);
  assert.deepEqual(
    streetGeometry({ origen: "A", destino: "B" }, nodeMap, { allowEndpointFallback: true }),
    [nodeMap.get("A"), nodeMap.get("B")],
  );
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

test("normalizes API routes and blocked edge IDs without changing the sequence", () => {
  const world = normalizeWorld({
    zombies: [],
    sobrevivientes: [],
    rutas: [{ sobrevivienteId: "S-1", nodos: ["A", "B", "C"] }],
    aristasBloqueadas: [["B", "A"]],
  });
  assert.deepEqual(world.rutas[0].nodes, ["A", "B", "C"]);
  assert.deepEqual(world.aristasBloqueadas, [["B", "A"]]);
});
