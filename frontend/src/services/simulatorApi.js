import { normalizeMap, normalizeWorld } from "./geo";

const baseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const requestTimeout = Number(import.meta.env.VITE_API_TIMEOUT_MS) || 5000;
const apiKey = import.meta.env.VITE_API_KEY || "";

async function request(path, options = {}) {
  if (!baseUrl) throw new Error("VITE_API_BASE_URL no está configurada");

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), requestTimeout);
  let response;

  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...options,
      signal: options.signal || controller.signal,
      headers: {
        Accept: "application/json",
        ...(apiKey ? { "x-api-key": apiKey } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`Tiempo de espera agotado (${requestTimeout} ms)`);
    }
    throw new Error(`No se pudo contactar al backend: ${error.message}`);
  } finally {
    window.clearTimeout(timeout);
  }

  if (!response.ok) {
    let detail = "";
    try {
      detail = (await response.json()).error || "";
    } catch {
      // El servidor puede responder con un cuerpo no JSON.
    }
    throw new Error(`HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
  }

  try {
    return await response.json();
  } catch {
    throw new Error(`Respuesta inválida del backend en ${path}`);
  }
}

/**
 * Adapta el contrato público del simulador al estado que consume la interfaz.
 *
 * El backend de este repositorio expone /estado y /mapa por separado.
 * Si el simulador compartido cambia nombres o anida estos campos, este es el
 * único punto que debe actualizarse antes de activar API REAL.
 */
export async function fetchWorldState() {
  const world = await request("/estado");

  if (!world || typeof world !== "object" ||
      !Array.isArray(world.zombies) ||
      !Array.isArray(world.sobrevivientes ?? world.survivors)) {
    throw new Error("GET /estado no tiene el formato esperado");
  }

  return normalizeWorld(world);
}

export async function fetchMapState() {
  const map = await request("/mapa");
  if (!map || typeof map !== "object" ||
      !Array.isArray(map.nodos ?? map.nodes) ||
      !Array.isArray(map.calles ?? map.streets)) {
    throw new Error("GET /mapa no tiene el formato esperado");
  }
  return normalizeMap(map);
}

/**
 * Solicita un paso para un sobreviviente concreto.
 * No se ejecuta automáticamente para todos los sobrevivientes.
 */
export async function requestNextStep({ sobrevivienteId, nodoActual, turno }) {
  return request("/paso", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sobrevivienteId, nodoActual, turno }),
  });
}

export const apiConfigured = Boolean(baseUrl);
