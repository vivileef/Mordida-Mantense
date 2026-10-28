# Mordida Mantense — frontend

Proyecto de **Brujas de la Nube** para SpookyThon 2026, Track A: **Escape de Manta Zombie**.

Centro de operaciones visual para el reto **Escape de Manta Zombie**. Está construido con React, Vite, Leaflet y React Leaflet. El modo inicial es `DEMO`: el estado de zombies, sobrevivientes, refugios y bloqueos es simulado, pero la red vial local proviene de un snapshot verificable de OpenStreetMap.

## 1. Crear y ejecutar en Windows PowerShell

Requiere Node.js 18 o superior.

```powershell
cd "C:\Users\danna\SPOOKYTHON 2026\Mordida-Mantense\frontend"
npm install
Copy-Item .env.example .env
npm run dev
```

Abre la URL que imprime Vite, normalmente `http://localhost:5173`.

Para validar la entrega de producción:

```powershell
npm run build
npm run preview
```

Pruebas automatizadas del frontend:

```powershell
npm test
```

El build queda en `frontend\dist`.

## 2. Probar DEMO

Al abrir la aplicación se muestra `DEMO · DATOS SIMULADOS`. Cada dos segundos cambia el turno y se mueve al menos una amenaza o sobreviviente. El panel de eventos agrega cambios de horda y despertares simulados.

- **Pausar/Reanudar** detiene o retoma el reloj de demostración.
- **Reiniciar demo** vuelve a la posición inicial.
- **DEMO/API REAL** cambia de fuente sin mezclar los estados.
- Un clic sobre un sobreviviente o una tarjeta de ruta selecciona su ruta y muestra sus detalles.

Las posiciones del DEMO son entidades ficticias ubicadas sobre nodos de la red vial local; no representan personas o amenazas reales.

## 3. Conectar el backend

Edita `.env` (no se deben subir credenciales):

```dotenv
VITE_API_BASE_URL=http://localhost:8080
VITE_POLL_INTERVAL_MS=2000
VITE_API_TIMEOUT_MS=5000
VITE_DATA_MODE=demo
```

Luego reinicia `npm run dev` y selecciona **API REAL**. `VITE_DATA_MODE=api` permite abrir directamente en modo API; el valor `demo` mantiene el modo DEMO por defecto. El adaptador consulta `GET /estado` cada ciclo y `GET /mapa` al iniciar API o mediante una acción explícita de refresco del mapa; así no se descarga el grafo estático cada dos segundos. Ambas respuestas se validan, se aplica un timeout configurable y, si una consulta falla, se conserva el último estado válido y se muestra el error. El botón `Avanzar un paso` llama `POST /paso` y `POST /mover-sobreviviente` solo para la persona seleccionada; no se envían acciones masivas. Consulta `INTEGRACION_BACKEND.md` para el detalle.

El backend de este repositorio se inicia desde la raíz con:

```powershell
$env:MANTA_API_KEY = "clave-local"
$env:MANTA_GRAPH_PATH = "tools/grafo-manta/manta.json"
python -m src.server
```

Para usar la API protegida durante el desarrollo, configura `MANTA_API_KEY`
solo en el entorno del proceso de Vite; nunca la pongas en una variable
`VITE_*` ni en el bundle del navegador:

```powershell
$env:MANTA_API_KEY = "clave-local"
npm run dev
```

En modo API, el selector de ronda envía `POST /escenario` para solicitar la
ronda 1, 2 o 3. **Avanzar un paso** solicita y confirma el movimiento solo
para el sobreviviente seleccionado. Un estado sin rutas o bloqueos se muestra
como está recibido; el frontend no crea datos de demostración para API.

## 4. Estructura principal

```text
src/
  App.jsx
  main.jsx
  components/       # cabecera, mapa, estadísticas, rutas y eventos
  data/             # mundo DEMO aislado
  hooks/            # sincronización de estado y temporizadores
  services/         # simulatorApi.js, compatibilidad API y simulación DEMO
  styles/           # estilos responsive
```

## 5. Despliegue estático (siguiente etapa)

Después de validar localmente, sube el contenido de `dist` a un bucket S3 configurado para hosting estático o detrás de CloudFront. Las variables `VITE_*` se sustituyen durante el build, por lo que la URL pública del backend debe configurarse antes de ejecutar `npm run build`; nunca se incluyen claves privadas de AWS en el navegador.

## Limitaciones conocidas

- El mapa base depende de los tiles públicos de OpenStreetMap y necesita internet.
- El backend actual no expone WebSocket; por eso API REAL usa polling configurable.
- El servidor local puede exigir `x-api-key`; no se configura esa clave en el frontend porque cualquier variable `VITE_*` queda expuesta en el bundle. En un despliegue real se recomienda colocar autenticación y CORS en la capa de API/gateway o mediante un proxy seguro.
- En desarrollo, el proxy local `/api` puede adjuntar `MANTA_API_KEY` desde el
  entorno del proceso de Vite. No publiques esa variable ni uses `VITE_API_KEY`.
  El alojamiento estático de producción no incluye un proxy seguro: la
  autenticación debe resolverse en una capa de servidor o gateway.
- API actualiza `/estado` mediante polling; no hay un canal push/WebSocket en
  el backend local. `POST /paso` devuelve el siguiente nodo y la confirmación
  de movimiento es explícita. La interfaz de rondas no demuestra por sí sola
  que los volúmenes y eventos del Track A estén validados.
- El mapa base utiliza los tiles públicos de OpenStreetMap y el DEMO carga `src/data/mantaRoadNetwork.json`, derivado de `tools/grafo-manta/manta.osm` para el bbox `-80.715,-0.975,-80.700,-0.960`. La red contiene 709 nodos y 2.232 aristas con geometrías LineString.
- En el snapshot actual, 1.302 de las 2.232 calles tienen nombre de OSM; las
  otras 930 se presentan honestamente como `Calle sin nombre`.
- Los datos OSM se distribuyen bajo la licencia ODbL; conserva la atribución de OpenStreetMap. Las geometrías GeoJSON usan `[longitud, latitud]` y Leaflet recibe `[latitud, longitud]`.

### Información requerida del backend

El adaptador principal está en `src/services/simulatorApi.js`. El frontend espera que `GET /estado` incluya al menos `turno`, `zombies`, `sobrevivientes`, `refugios`, `aristasBloqueadas`, `eventos` y `nodos`. Cada nodo debe tener `id`, `lat` y `lng`; cada zombie debe tener `id`, `tipo` y `nodo`; cada sobreviviente debe tener `id`, `nodo`, `refugioId` y `activo`. Además, `GET /mapa` debe incluir `nodos` y `calles` con `origen` y `destino`; la geometría de vía es opcional (`geometry.coordinates` GeoJSON como `[longitud, latitud]`, o una lista equivalente de puntos). Para dibujar rutas reales, `GET /estado` debe incluir `rutas` con al menos `survivorId` y `nodes`/`nodos`, o una geometría de ruta siguiendo las calles y, si aplica, `status`, origen, destino y refugio asignado. `POST /paso` por sí solo devuelve un siguiente nodo y no proporciona geometría suficiente para pintar una ruta completa. El adaptador normaliza las variantes `node`/`nodo`, `capacity`/`capacidad`, `geometry`/`geometria`, `nodes`/`nodos`, y muestra un error cuando faltan identificadores o coordenadas válidas.
