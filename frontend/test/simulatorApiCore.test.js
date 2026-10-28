import test from "node:test";
import assert from "node:assert/strict";
import { createSimulatorApi } from "../src/services/simulatorApiCore.js";

test("validates and normalizes the backend world state without losing route order", async () => {
  const calls = [];
  const api = createSimulatorApi(async (path) => {
    calls.push(path);
    return {
      turno: 7,
      zombies: [],
      sobrevivientes: [{ id: "S-1", node: "A", refugeId: "R-1" }],
      refugios: [{ id: "R-1", node: "B" }],
      rutas: [{ sobrevivienteId: "S-1", nodos: ["A", "B"] }],
      aristasBloqueadas: [["B", "A"]],
    };
  });
  const state = await api.fetchWorldState();
  assert.deepEqual(calls, ["/estado"]);
  assert.equal(state.turno, 7);
  assert.deepEqual(state.rutas[0].nodes, ["A", "B"]);
  assert.deepEqual(state.aristasBloqueadas, [["B", "A"]]);
});

test("rejects malformed map and world responses instead of replacing them with demo data", async () => {
  const badWorld = createSimulatorApi(async () => ({ zombies: [], sobrevivientes: "invalid" }));
  const badMap = createSimulatorApi(async () => ({ nodos: [], calles: null }));
  await assert.rejects(badWorld.fetchWorldState(), /GET \/estado no tiene el formato esperado/);
  await assert.rejects(badMap.fetchMapState(), /GET \/mapa no tiene el formato esperado/);
});

test("fetches map nodes, streets and geometries using the existing map endpoint", async () => {
  const calls = [];
  const api = createSimulatorApi(async (path) => {
    calls.push(path);
    return { nodos: [{ id: "A", lat: -0.5, lng: -80 }], calles: [] };
  });
  const map = await api.fetchMapState();
  assert.deepEqual(calls, ["/mapa"]);
  assert.equal(map.nodos[0].id, "A");
});

test("preserves the existing scenario, next-step and movement endpoint contracts", async () => {
  const requests = [];
  const api = createSimulatorApi(async (path, options) => {
    requests.push({ path, options });
    return { ok: true };
  });

  await api.selectScenario("ronda3");
  await api.requestNextStep({ sobrevivienteId: "S-1", nodoActual: "A", turno: 4 });
  await api.moveSurvivor({ sobrevivienteId: "S-1", nodoDestino: "B" });

  assert.deepEqual(requests.map(({ path }) => path), ["/escenario", "/paso", "/mover-sobreviviente"]);
  assert.deepEqual(requests.map(({ options }) => JSON.parse(options.body)), [
    { escenario: "ronda3" },
    { sobrevivienteId: "S-1", nodoActual: "A", turno: 4 },
    { sobrevivienteId: "S-1", nodoDestino: "B" },
  ]);
});
