export function createHttpClient({
  baseUrl,
  timeoutMs = 5000,
  fetchImpl = globalThis.fetch,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
}) {
  const root = String(baseUrl ?? "").replace(/\/$/, "");

  return async function request(path, options = {}) {
    if (!root) throw new Error("VITE_API_BASE_URL no está configurada");

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimer(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const timeoutError = () => new Error(`Tiempo de espera agotado (${timeoutMs} ms)`);

    try {
      let response;
      try {
        response = await fetchImpl(`${root}${path}`, {
          ...options,
          signal: controller.signal,
          headers: {
            Accept: "application/json",
            ...options.headers,
          },
        });
      } catch (error) {
        if (timedOut || error.name === "AbortError") throw timeoutError();
        throw new Error(`No se pudo contactar al backend: ${error.message}`);
      }

      if (!response.ok) {
        let detail = "";
        try {
          detail = (await response.json()).error || "";
        } catch (error) {
          if (timedOut || error.name === "AbortError") throw timeoutError();
          // El servidor puede responder con un cuerpo no JSON.
        }
        if (timedOut) throw timeoutError();
        throw new Error(`HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
      }

      try {
        return await response.json();
      } catch (error) {
        if (timedOut || error.name === "AbortError") throw timeoutError();
        throw new Error(`Respuesta inválida del backend en ${path}`);
      }
    } finally {
      clearTimer(timer);
    }
  };
}
