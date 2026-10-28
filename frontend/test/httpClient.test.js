import test from "node:test";
import assert from "node:assert/strict";
import { createHttpClient } from "../src/services/httpClient.js";

test("normalizes base URL, merges request headers, and parses JSON", async () => {
  let observed;
  const request = createHttpClient({
    baseUrl: "http://localhost:8080/",
    fetchImpl: async (url, options) => {
      observed = { url, options };
      return { ok: true, json: async () => ({ turno: 2 }) };
    },
  });

  assert.deepEqual(await request("/estado", { headers: { "Content-Type": "application/json" } }), { turno: 2 });
  assert.equal(observed.url, "http://localhost:8080/estado");
  assert.equal(observed.options.headers.Accept, "application/json");
  assert.equal(observed.options.headers["Content-Type"], "application/json");
  assert.ok(observed.options.signal instanceof AbortSignal);
});

test("returns an HTTP status and server error detail", async () => {
  const request = createHttpClient({
    baseUrl: "/api",
    fetchImpl: async () => ({
      ok: false,
      status: 409,
      json: async () => ({ error: "Movimiento inválido" }),
    }),
  });
  await assert.rejects(request("/mover-sobreviviente"), /HTTP 409: Movimiento inválido/);
});

test("identifies authentication failures separately from other HTTP errors", async () => {
  const request = createHttpClient({
    baseUrl: "/api",
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: "API key invalida o ausente" }),
    }),
  });
  await assert.rejects(
    request("/estado"),
    /Autenticación requerida \(HTTP 401\): API key invalida o ausente/,
  );
});

test("keeps the HTTP status code available for endpoint-specific handling", async () => {
  const request = createHttpClient({
    baseUrl: "/api",
    fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({ error: "Not found" }) }),
  });
  await assert.rejects(request("/ruta/S-1"), (error) => error.status === 404);
});

test("reports connection failures without hiding the cause", async () => {
  const request = createHttpClient({
    baseUrl: "/api",
    fetchImpl: async () => { throw new Error("socket closed"); },
  });
  await assert.rejects(request("/estado"), /No se pudo contactar al backend: socket closed/);
});

test("keeps the timeout active until the response body has been read", async () => {
  const request = createHttpClient({
    baseUrl: "/api",
    timeoutMs: 10,
    fetchImpl: async (_url, { signal }) => ({
      ok: true,
      json: () => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          reject(Object.assign(new Error("aborted while reading"), { name: "AbortError" }));
        }, { once: true });
      }),
    }),
  });
  await assert.rejects(request("/estado"), /Tiempo de espera agotado \(10 ms\)/);
});

test("rejects invalid JSON and missing API configuration clearly", async () => {
  const invalidJson = createHttpClient({
    baseUrl: "/api",
    fetchImpl: async () => ({ ok: true, json: async () => { throw new SyntaxError("bad JSON"); } }),
  });
  await assert.rejects(invalidJson("/estado"), /Respuesta inválida del backend en \/estado/);

  const unconfigured = createHttpClient({ baseUrl: "" });
  await assert.rejects(unconfigured("/estado"), /VITE_API_BASE_URL no está configurada/);
});
