const baseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const apiKey = import.meta.env.VITE_API_KEY || '';

async function request(path, options = {}) {
  if (!baseUrl) throw new Error('VITE_API_BASE_URL no está configurada');
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { Accept: 'application/json', ...(apiKey ? { 'x-api-key': apiKey } : {}), ...options.headers },
  });
  if (!response.ok) {
    let detail = '';
    try { detail = (await response.json()).error || ''; } catch { /* respuesta no JSON */ }
    throw new Error(`HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
  }
  return response.json();
}

export async function fetchWorldState() {
  const [world, map] = await Promise.all([request('/estado'), request('/mapa')]);
  return { ...world, ...map };
}

export async function requestNextStep({ sobrevivienteId, nodoActual, turno }) {
  return request('/paso', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sobrevivienteId, nodoActual, turno }),
  });
}

export const apiConfigured = Boolean(baseUrl);
