import { normalizeMap, normalizeRoute, normalizeWorld } from "./geo.js";

export function createSimulatorApi(request) {
  return {
    async fetchWorldState() {
      const world = await request("/estado");
      const survivors = world?.sobrevivientes ?? world?.survivors;
      if (!world || typeof world !== "object" ||
          !Array.isArray(world.zombies) ||
          (survivors !== undefined && !Array.isArray(survivors))) {
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

    async fetchSurvivorRoute(sobrevivienteId) {
      const id = String(sobrevivienteId);
      try {
        const route = await request(`/ruta/${encodeURIComponent(id)}`);
        if (!route || typeof route !== "object" ||
            !Array.isArray(route.nodos ?? route.nodes) ||
            !Array.isArray(route.calles ?? route.streets)) {
          throw new Error("GET /ruta/{sobrevivienteId} no tiene el formato esperado");
        }
        const normalized = normalizeRoute(route);
        if (normalized.survivorId !== id) {
          throw new Error("GET /ruta/{sobrevivienteId} devolvió otra persona");
        }
        return normalized;
      } catch (error) {
        if (error.status === 404) return null;
        throw error;
      }
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

    simulateTurn() {
      return request("/simular-turno", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    },

    dispatchRescue() {
      return request("/rescate/despachar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    },
  };
}
