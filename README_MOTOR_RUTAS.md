# Motor de rutas — Integrante 2 (Mero)

Este documento describe únicamente el trabajo del motor de rutas y su API en la
rama `feature/motor-rutas`. No reemplaza el README general del equipo.

## Qué se implementó

- **Dijkstra ponderado por distancia:** el motor recorre el grafo existente y
  suma `distancia_m` de cada calle para elegir el camino más corto.
- **Refugios y alternativas:** elige un refugio alcanzable de menor distancia;
  entrega rutas alternativas para que el frontend pueda representarlas.
- **Evaluación de peligros:** evita nodos ocupados por zombies visibles,
  calles bloqueadas, zona de horda configurable y cruces frontales observables.
- **Caché:** conserva planes para la misma posición, preferencia de refugio y
  estado del mundo. Si cambian zombies, calles bloqueadas o refugios, cambia la
  clave y se calcula una ruta nueva.
- **API:** `POST /paso` conserva el contrato público con solo
  `{"siguienteNodo":"..."}` y exige `x-api-key`. Si no hay un siguiente paso
  seguro, se queda en el nodo actual; no inventa una conexión.
- **Ruta completa:** `GET /ruta/{sobrevivienteId}` expone el refugio, los nodos
  ordenados, las calles y las alternativas.

El motor usa `CityGraph`, `WorldState` y el simulador existentes; no crea un
grafo ni una simulación paralelos. `src/routing.py` queda como fachada para
mantener compatibilidad con sus consumidores anteriores.

## Archivos de esta parte

| Archivo | Función |
|---|---|
| `src/route_engine/paths.py` | Dijkstra, alternativas y selección de refugio |
| `src/route_engine/hazards.py` | Zombies, hordas, bloqueos y cruces frontales |
| `src/route_engine/cache.py` | Caché LRU de rutas |
| `src/route_engine/types.py` | Interfaces para leer el grafo y estado existentes |
| `src/routing.py` | Fachada de compatibilidad |
| `src/service.py` | Conecta el motor al estado actual del simulador |
| `src/server.py` | Publica endpoints, autenticación y CORS |
| `tests/test_route_api.py` | Pruebas del motor y endpoints HTTP |
| `scripts/load_test.py` | Ensayo local de 200 llamadas a `POST /paso` |

## Endpoints relevantes

| Endpoint | Acceso | Resultado |
|---|---|---|
| `POST /paso` | `x-api-key` | Solo `siguienteNodo` |
| `GET /ruta/{sobrevivienteId}` | `x-api-key` | Ruta completa, refugio, calles y alternativas |
| `GET /mapa` | Público | Nodos, coordenadas y calles del grafo cargado |
| `GET /estado` | `x-api-key` | Estado actual que comparte el motor con el simulador |
| `GET /salud` | Público | Estado del backend y turno actual |

`GET /ruta/{id}` devuelve IDs de nodos. El frontend obtiene las coordenadas
correspondientes de `GET /mapa` y une ambos resultados. Por ahora `/mapa`
expone la cuadrícula demo de 25 nodos de `CityGraph.demo()`; todavía no son
calles reales de Manta. Cuando esté listo el JSON del mapa, el motor lo puede
consumir mediante `CityGraph.from_dict(...)` sin duplicar el planificador.

## Configuración

```powershell
$env:MANTA_API_KEY = "clave-local"
$env:MANTA_HORDE_RADIUS = "1"
$env:MANTA_CORS_ORIGIN = "http://localhost:5173"
python -m src.server
```

La clave permanece en el backend. No se debe incluir `MANTA_API_KEY` en el
frontend; se necesitará que el navegador use un backend intermediario o la
estrategia de autenticación que acuerde el equipo.

## Pruebas

Suite completa, incluidas las regresiones del simulador:

```powershell
python -m unittest discover -s tests -v
```

Solo motor y API:

```powershell
python -m unittest discover -s tests -p "test_route_api.py" -v
```

`tests/test_route_api.py` comprueba autenticación y contrato de `/paso`, los
endpoints `/ruta`, `/mapa` y `/salud`, CORS/preflight, rutas más cortas y
alternativas, refugios, bloqueos, zombies, radio de horda, cruces frontales,
ausencia de ruta segura e invalidación de caché.

Ensayo HTTP de 200 solicitudes:

```powershell
python scripts/load_test.py
```

La medición local más reciente fue con ocho solicitudes concurrentes y cuatro
llamadas de calentamiento reportadas aparte: 200 éxitos, 0 errores, media
14.630 ms, p95 13.133 ms y máxima 514.025 ms. El p95 quedó bajo 500 ms; la
máxima superó ese valor. La medición usa el servidor local y el grafo demo, no
representa todavía AWS ni el mapa real de Manta. Para variar concurrencia:

```powershell
$env:MANTA_LOAD_WORKERS = "8"
python scripts/load_test.py
```

## Pendiente para conectar con Pau

- Sustituir el mapa demo por el JSON validado de Manta y confirmar que los IDs
  coinciden con los que el frontend consume.
- Dibujar `nodos` de `/ruta/{id}` usando coordenadas de `/mapa`.
- Configurar el origen real de CORS y resolver cómo el frontend llega a las
  rutas protegidas sin exponer la clave.
- Volver a medir latencias con el mapa real y el entorno desplegado.
