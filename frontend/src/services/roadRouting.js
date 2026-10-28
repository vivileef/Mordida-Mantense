const OSRM_BASE_URL =
  import.meta.env.VITE_OSRM_BASE_URL || "https://router.project-osrm.org";

export async function getRoadRoute(start, end) {
  if (
    !Number.isFinite(start?.lat) ||
    !Number.isFinite(start?.lng) ||
    !Number.isFinite(end?.lat) ||
    !Number.isFinite(end?.lng)
  ) {
    throw new Error("Las coordenadas de inicio y destino no son válidas.");
  }

  // OSRM recibe las coordenadas en orden longitud,latitud.
  const coordinates = `${start.lng},${start.lat};${end.lng},${end.lat}`;

  const url =
    `${OSRM_BASE_URL}/route/v1/driving/${coordinates}` +
    "?overview=full&geometries=geojson&alternatives=false";

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`El servicio de rutas respondió ${response.status}.`);
  }

  const data = await response.json();

  if (data.code !== "Ok" || !data.routes?.[0]?.geometry?.coordinates?.length) {
    throw new Error("No se encontró una ruta vial para esos puntos.");
  }

  const geometry = data.routes[0].geometry;

  return {
    geometry,
    positions: geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    distanceMeters: data.routes[0].distance,
    durationSeconds: data.routes[0].duration,
  };
}
