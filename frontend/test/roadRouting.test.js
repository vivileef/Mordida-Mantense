import test from "node:test";
import assert from "node:assert/strict";
import {
  applyBlockOverrides,
  findShortestRoute,
  hasDirectedConnection,
  isDirectedEdgeBlocked,
  recalculateWorldRoutes,
  setWorldEdgeBlocked,
  updateBlockOverrides,
} from "../src/services/roadRouting.js";
import { createDemoService } from "../src/services/simulationService.js";

function worldFixture() {
  return {
    nodos: ["A", "B", "C", "D"].map((id) => ({ id, lat: 0, lng: 0 })),
    calles: [
      { origen: "A", destino: "B", distancia_m: 1 },
      { origen: "B", destino: "D", distancia_m: 1 },
      { origen: "A", destino: "C", distancia_m: 3 },
      { origen: "C", destino: "D", distancia_m: 3 },
      { origen: "B", destino: "A", distancia_m: 1 },
    ],
    aristasBloqueadas: [],
    sobrevivientes: [{ id: "S-1", nodo: "A", refugioId: "R-1", activo: true }],
    refugios: [{ id: "R-1", nodo: "D" }],
    rutas: [],
  };
}

test("blocks a real directed connection and rejects a missing connection", () => {
  const world = worldFixture();
  assert.equal(setWorldEdgeBlocked(world, "A", "B", true).ok, true);
  assert.equal(setWorldEdgeBlocked(world, "A", "D", true).ok, false);
  assert.equal(hasDirectedConnection(world, "A", "B"), true);
  assert.equal(hasDirectedConnection(world, "B", "C"), false);
});

test("blocking the same edge twice does not duplicate the blocked state", () => {
  const world = worldFixture();
  const first = setWorldEdgeBlocked(world, "A", "B", true);
  const second = setWorldEdgeBlocked(first.world, "A", "B", true);
  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.deepEqual(second.world.aristasBloqueadas, [["A", "B"]]);
});

test("unblocking removes only the matching directed edge", () => {
  const world = { ...worldFixture(), aristasBloqueadas: [["A", "B"], ["B", "A"]] };
  const result = setWorldEdgeBlocked(world, "A", "B", false);
  assert.deepEqual(result.world.aristasBloqueadas, [["B", "A"]]);
});

test("directed routes never use an unavailable reverse-only connection", () => {
  const world = { ...worldFixture(), calles: [{ origen: "B", destino: "A", distancia_m: 1 }] };
  assert.equal(findShortestRoute(world, "A", "B"), null);
});

test("Dijkstra chooses the route with the lowest real distance", () => {
  const plan = findShortestRoute(worldFixture(), "A", "D");
  assert.deepEqual(plan.nodes, ["A", "B", "D"]);
  assert.equal(plan.distance_m, 2);
});

test("a route avoids every blocked directed edge and uses a valid alternative", () => {
  const world = worldFixture();
  const plan = findShortestRoute(world, "A", "D", [["A", "B"]]);
  assert.deepEqual(plan.nodes, ["A", "C", "D"]);
  assert.equal(plan.streets.length, plan.nodes.length - 1);
  for (let index = 0; index < plan.streets.length; index += 1) {
    assert.equal(plan.streets[index].origen, plan.nodes[index]);
    assert.equal(plan.streets[index].destino, plan.nodes[index + 1]);
    assert.equal(isDirectedEdgeBlocked([["A", "B"]], plan.nodes[index], plan.nodes[index + 1]), false);
  }
});

test("reports no route when every available first step is blocked", () => {
  const plan = findShortestRoute(worldFixture(), "A", "D", [["A", "B"], ["A", "C"]]);
  assert.equal(plan, null);
});

test("blocking a route edge recalculates the survivor route", () => {
  const world = recalculateWorldRoutes(worldFixture());
  assert.deepEqual(world.rutas[0].nodes, ["A", "B", "D"]);
  const blocked = setWorldEdgeBlocked(world, "A", "B", true).world;
  assert.deepEqual(blocked.rutas[0].nodes, ["A", "C", "D"]);
  assert.equal(blocked.rutas[0].recalculadaLocalmente, true);
});

test("when no alternative remains, route status is sin_ruta and has no drawable nodes", () => {
  const world = { ...worldFixture(), aristasBloqueadas: [["A", "B"], ["A", "C"]] };
  const recalculated = recalculateWorldRoutes(world);
  assert.equal(recalculated.rutas[0].status, "sin_ruta");
  assert.deepEqual(recalculated.rutas[0].nodes, []);
});

test("unblocking lets local recalculation use the reopened connection", () => {
  const world = { ...worldFixture(), aristasBloqueadas: [["A", "B"]] };
  const unblocked = setWorldEdgeBlocked(world, "A", "B", false).world;
  assert.deepEqual(unblocked.rutas[0].nodes, ["A", "B", "D"]);
});

test("API-style local overrides do not mutate or merge into the server state", () => {
  const serverWorld = worldFixture();
  const update = updateBlockOverrides(serverWorld, [], "A", "B", true);
  assert.equal(update.ok, true);
  assert.deepEqual(serverWorld.aristasBloqueadas, []);
  assert.deepEqual(update.overrides, [{ origen: "A", destino: "B", bloqueada: true }]);
  assert.deepEqual(applyBlockOverrides(serverWorld.aristasBloqueadas, update.overrides), [["A", "B"]]);
  const unblocked = updateBlockOverrides(serverWorld, update.overrides, "A", "B", false);
  assert.deepEqual(unblocked.overrides, []);
  assert.deepEqual(unblocked.blockedEdges, []);
});

test("API overrides are idempotent and can locally reopen a server-blocked direction", () => {
  const serverWorld = { ...worldFixture(), aristasBloqueadas: [["A", "B"]] };
  const opened = updateBlockOverrides(serverWorld, [], "A", "B", false);
  assert.deepEqual(opened.blockedEdges, []);
  assert.deepEqual(serverWorld.aristasBloqueadas, [["A", "B"]]);
  const blockedAgain = updateBlockOverrides(serverWorld, opened.overrides, "A", "B", true);
  const repeated = updateBlockOverrides(serverWorld, blockedAgain.overrides, "A", "B", true);
  assert.equal(repeated.overrides.length, 0);
  assert.deepEqual(repeated.blockedEdges, [["A", "B"]]);
});

test("does not keep a backend route crossing a local block when survivor data is absent", () => {
  const world = {
    ...worldFixture(),
    sobrevivientes: [],
    camposEstadoAusentes: ["sobrevivientes"],
    aristasBloqueadas: [["A", "B"]],
    rutas: [{ survivorId: "S-1", nodes: ["A", "B", "D"], status: "activa" }],
  };
  const recalculated = recalculateWorldRoutes(world);
  assert.equal(recalculated.rutas[0].status, "sin_ruta");
  assert.deepEqual(recalculated.rutas[0].nodes, []);
  assert.ok(recalculated.advertenciasRutasLocales.length > 0);
});

test("demo service supports local blocking and reset restores its initial scenario", async () => {
  const service = createDemoService();
  const initial = await service.getState();
  const [origin, destination] = initial.calles[0] && [initial.calles[0].origen, initial.calles[0].destino];
  const blocked = service.setBlockedEdge(origin, destination, true);
  assert.equal(blocked.ok, true);
  const reset = await service.reset();
  assert.deepEqual(reset.aristasBloqueadas, initial.aristasBloqueadas);
});

test("recalculates routes for a 200-survivor world without sharing route records", () => {
  const world = worldFixture();
  world.sobrevivientes = Array.from({ length: 200 }, (_, index) => ({
    id: `S-${index}`,
    nodo: "A",
    refugioId: "R-1",
    activo: true,
  }));
  const recalculated = recalculateWorldRoutes(world);
  assert.equal(recalculated.rutas.length, 200);
  assert.deepEqual(recalculated.rutas[0].nodes, ["A", "B", "D"]);
  assert.deepEqual(recalculated.rutas[199].nodes, ["A", "B", "D"]);
  assert.notEqual(recalculated.rutas[0], recalculated.rutas[199]);
});
