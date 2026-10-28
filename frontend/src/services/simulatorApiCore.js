import { normalizeMap, normalizeWorld } from "./geo.js";

export function createSimulatorApi(request) {
  return {
    async fetchWorldState() {
      const world = await request("/estado");
      if (!world || typeof world !== "object" ||
          !Array.isArray(world.zombies) ||
          !Array.isArray(world.sobrevivientes ?? world.survivors)) {
        throw new Error("GET /estado no tiene el formato esperado");
      }
      return normalizeWorld(world);
    },

    async fetchMapState() {
      const map = await request("/mapa");
      if (!map || typeof map !== "object" ||
          !Array.isArray(map.nodos ?? map.nodes) ||
          !Array.isArray(map.calles ?? map.streets)) {
        throw new Error("GET /mapa no tiene el formato esperado");
      }
      return normalizeMap(map);
    },

    requestNextStep({ sobrevivienteId, nodoActual, turno }) {
      return request("/paso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sobrevivienteId, nodoActual, turno }),
      });
    },

    moveSurvivor({ sobrevivienteId, nodoDestino }) {
      return request("/mover-sobreviviente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sobrevivienteId, nodoDestino }),
      });
    },

    selectScenario(escenario) {
      return request("/escenario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ escenario }),
      });
    },
  };
}
