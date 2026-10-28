import test from "node:test";
import assert from "node:assert/strict";
import { createSimulatorApi } from "../src/services/simulatorApiCore.js";
import { geometryToPositions } from "../src/services/geo.js";

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

test("accepts the AWS state shape with turn and zombies even when survivors are absent", async () => {
  const api = createSimulatorApi(async (path) => {
    assert.equal(path, "/estado");
    return {
      turno: 8,
      zombies: [{
        id: "Z-1",
        tipo: "caminante",
        nodo: "N-1",
        nombreNodo: "Avenida de prueba",
        visible: true,
      }],
    };
  });

  const state = await api.fetchWorldState();

  assert.equal(state.turno, 8);
  assert.deepEqual(state.sobrevivientes, []);
  assert.equal(state.zombies[0].nodo, "N-1");
  assert.equal(state.zombies[0].tipo, "caminante");
  assert.equal(state.zombies[0].nombreNodo, "Avenida de prueba");
  assert.equal(state.zombies[0].visible, true);
  assert.ok(state.camposEstadoAusentes.includes("sobrevivientes"));
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

test("normalizes the live mapa street shape and converts GeoJSON coordinates for Leaflet", async () => {
  const geometry = {
    type: "LineString",
    coordinates: [[-80.714, -0.991], [-80.715, -0.990]],
  };
  const api = createSimulatorApi(async (path) => {
    assert.equal(path, "/mapa");
    return {
      nodos: [{ id: "N-1", nombre: "Cruce", lat: -0.991, lng: -80.714 }],
      calles: [{
        origen: "N-1",
        destino: "N-2",
        distancia_m: 120,
        tipo: "avenida",
        nombre: "Avenida",
        geometry,
      }],
    };
  });

  const map = await api.fetchMapState();

  assert.equal(map.calles[0].origen, "N-1");
  assert.equal(map.calles[0].destino, "N-2");
  assert.equal(map.calles[0].distancia_m, 120);
  assert.equal(map.calles[0].geometry, geometry);
  assert.deepEqual(geometryToPositions(map.calles[0].geometry), [
    [-0.991, -80.714],
    [-0.990, -80.715],
  ]);
});

test("loads a survivor route from the documented route-details endpoint", async () => {
  let observedPath;
  const api = createSimulatorApi(async (path) => {
    observedPath = path;
    return {
      sobrevivienteId: "S-42",
      refugioId: "R-3",
      nodos: ["N-1", "N-2"],
      calles: [{ origen: "N-1", destino: "N-2", nombre: "Avenida", distancia_m: 80, tipo: "avenida" }],
      distancia_m: 80,
      alternativas: [],
    };
  });

  const route = await api.fetchSurvivorRoute("S-42");

  assert.equal(observedPath, "/ruta/S-42");
  assert.equal(route.survivorId, "S-42");
  assert.equal(route.refugeId, "R-3");
  assert.deepEqual(route.nodes, ["N-1", "N-2"]);
  assert.deepEqual(route.streets.map((street) => [street.origen, street.destino]), [["N-1", "N-2"]]);
  assert.equal(route.distancia_m, 80);
});

test("treats the documented no-safe-route 404 as an unavailable route", async () => {
  const api = createSimulatorApi(async () => {
    throw Object.assign(new Error("HTTP 404: Ruta segura no encontrada"), { status: 404 });
  });

  assert.equal(await api.fetchSurvivorRoute("S-42"), null);
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

test("simulates one turn with the documented empty JSON body", async () => {
  const requests = [];
  const api = createSimulatorApi(async (path, options) => {
    requests.push({ path, options });
    return { turno: 7 };
  });

  assert.deepEqual(await api.simulateTurn(), { turno: 7 });
  assert.equal(requests[0].path, "/simular-turno");
  assert.equal(requests[0].options.method, "POST");
  assert.equal(requests[0].options.headers["Content-Type"], "application/json");
  assert.equal(requests[0].options.body, "{}");
});
