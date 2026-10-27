# Mordida Manta

Motor de simulación para **Escape de Manta Zombie (Track A)**. El proyecto
modela un mapa como grafo, mueve zombies por turnos, registra eventos de ciudad,
detecta mordidas y expone el estado del mundo para un simulador o un panel web.

> **Estado actual:** MVP local con simulador y motor de rutas integrados. El
> mapa de 25 nodos sigue siendo solo un fixture de desarrollo.

## Arquitectura actual

```text
Cliente / simulador / frontend
              |
              | HTTP + x-api-key
              v
        src/server.py
              |
              v
        src/service.py
          /           \
         v             v
  ApocalypseSimulator  A* routing
  src/simulator.py     src/routing.py
         |
         v
      WorldState
      src/model.py
         |
         v
      CityGraph
      src/graph.py
```

El servidor usa un reloj interno que avanza un turno cada 2 segundos. El estado
vive en memoria durante esta primera versión; al reiniciar el proceso se
restaura el escenario inicial.

## Requisitos

- Python 3.10 o superior.
- No se necesitan dependencias externas para ejecutar el MVP.
- `MANTA_HORDE_RADIUS` configura el radio peligroso de las hordas en saltos
  (por defecto `1`; use `0` para marcar solo el nodo de la horda).
- `MANTA_CORS_ORIGIN` establece el origen permitido por CORS (por defecto `*`;
  en despliegue se recomienda el dominio del frontend).

## Instalación y ejecución

Desde la raíz del repositorio:

```powershell
$env:MANTA_API_KEY = "clave-local"
$env:MANTA_RANDOM_SEED = "42"
python -m src.server
```

El servidor queda disponible en:

```text
http://localhost:8080
```

El proceso avanza automáticamente un turno cada 2 segundos. Para detenerlo:

```text
Ctrl + C
```

## API

Las rutas protegidas requieren la cabecera; `/`, `/mapa` y `/salud` son
públicas. Use:

```text
x-api-key: clave-local
```

### `GET /`

Muestra las rutas disponibles:

```powershell
curl.exe http://localhost:8080/
```

### `GET /estado`

Devuelve el estado completo del mundo:

```powershell
curl.exe -H "x-api-key: clave-local" `
  http://localhost:8080/estado
```

Incluye:

- Turno actual.
- Zombies, tipo, nodo y visibilidad.
- Sobrevivientes, nodo actual, nodo anterior y estado activo.
- Refugios.
- Calles bloqueadas.
- Eventos ocurridos.
- Eventos programados.
- Coordenadas de los nodos.
- Rutas planificadas completas, con nombres de nodos y calles.

### `POST /paso`

Recibe una petición de ruta y devuelve únicamente el siguiente nodo:

```powershell
$headers = @{ "x-api-key" = "clave-local" }
$body = @{
    sobrevivienteId = "S-0001"
    nodoActual = "N-0013"
    turno = 1
} | ConvertTo-Json

Invoke-RestMethod -Method Post `
  -Uri "http://localhost:8080/paso" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $body | ConvertTo-Json
```

Respuesta:

```json
{
  "siguienteNodo": "N-0012"
}
```

El resultado siempre debe ser un vecino por una calle abierta o el mismo nodo.

### `POST /mover-sobreviviente`

Confirma el movimiento que efectivamente realizó un sobreviviente. Este
endpoint permite guardar `nodoAnterior` y detectar cruces con zombies:

```powershell
$body = @{
    sobrevivienteId = "S-0001"
    nodoDestino = "N-0014"
} | ConvertTo-Json

Invoke-RestMethod -Method Post `
  -Uri "http://localhost:8080/mover-sobreviviente" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $body | ConvertTo-Json
```

Devuelve `movido: false` si el destino no es vecino, la calle está bloqueada o
el sobreviviente ya fue eliminado.

### `POST /simular-turno`

Avanza manualmente exactamente un turno. Es útil para pruebas; el servidor ya
lo ejecuta automáticamente cada 2 segundos.

```powershell
Invoke-RestMethod -Method Post `
  -Uri "http://localhost:8080/simular-turno" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body '{}'
```

También permite simular un cierre de calle:

```powershell
$body = @{
    aristaBloqueada = @("N-0013", "N-0014")
} | ConvertTo-Json

Invoke-RestMethod -Method Post `
  -Uri "http://localhost:8080/simular-turno" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $body | ConvertTo-Json
```

### `POST /escenario`

Carga uno de los escenarios de la prueba de fuego:

| Escenario | Sobrevivientes | Amenazas | Eventos |
|---|---:|---|---|
| `ronda1` | 20 | Caminantes | Ninguno |
| `ronda2` | 80 | Caminantes, corredores y hordas | Puente en turno 10 |
| `ronda3` | 200 | Todos los tipos, incluidos dormidos | Puente en turno 10 y avenida en turno 20 |

```powershell
$body = @{ escenario = "ronda3" } | ConvertTo-Json

Invoke-RestMethod -Method Post `
  -Uri "http://localhost:8080/escenario" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $body | ConvertTo-Json
```

### `GET /mapa`

Devuelve el mapa en un formato que puede consumir Leaflet u otro frontend:

```powershell
curl.exe http://localhost:8080/mapa
```

La respuesta contiene:

```json
{
  "nodos": [
    {"id": "N-0001", "lat": -0.95, "lng": -80.72}
  ],
  "calles": [
    {
      "origen": "N-0001",
      "destino": "N-0002",
      "distancia_m": 100,
      "tipo": "avenida"
    }
  ]
}
```

### `GET /ruta/{sobrevivienteId}`

Con `x-api-key`, devuelve la ruta completa segura, sus calles, distancia y
rutas alternativas. Si el refugio asignado está bloqueado por peligro, el
planificador elige el refugio alcanzable de menor distancia.

### `GET /salud`

Devuelve `{"estado":"ok","turno":...}` para comprobar que el backend
responde. No revela la API key.

La clave se mantiene exclusivamente en el backend. Un frontend desplegado no
debe incluir `MANTA_API_KEY`; para una aplicación pública se necesita un
backend intermediario o una estrategia de sesión antes de exponer rutas
protegidas directamente al navegador.

## Reglas implementadas

- **Caminante:** avanza una calle cada dos turnos.
- **Corredor:** avanza hasta dos calles por turno y persigue sobrevivientes a
  tres nodos o menos.
- **Horda:** permanece en su nodo; `MANTA_HORDE_RADIUS` configura cuántos
  saltos vecinos se consideran peligrosos (predeterminado: 1).
- **Dormido:** permanece invisible hasta que un sobreviviente se acerca a dos
  nodos o menos; entonces despierta como caminante.
- **Mordida:** ocurre si zombie y sobreviviente comparten nodo o se cruzan en
  direcciones opuestas por la misma calle.
- **Calle bloqueada:** se bloquea en ambos sentidos.
- **Eventos:** se aplican automáticamente en el turno programado.
- **Rutas:** Dijkstra ponderado por distancia de calle, con alternativas y
  caché invalidada por cambios de zombies y calles bloqueadas.
- **Cruce frontal:** el planificador evita una calle si el último movimiento
  visible de un zombie cruzó en sentido contrario.

## Pruebas

Ejecutar desde la raíz:

```powershell
python -m unittest discover -s tests -v
```

Ensayo de 200 solicitudes HTTP reales en un servidor local aislado:

```powershell
python scripts/load_test.py
```

El ensayo precalienta las cuatro combinaciones de refugio con el mismo origen
y reporta ese tiempo aparte. Luego mide 200 llamadas con ocho clientes
concurrentes. Ajuste la concurrencia con `MANTA_LOAD_WORKERS`. Imprime éxitos,
errores, latencia media, p95 y máxima en milisegundos.

La suite cubre:

- Movimiento de los tipos de zombie.
- Turnos automáticos.
- Activación de dormidos.
- Mordidas y cruces opuestos.
- Validación de movimientos.
- Bloqueos y eventos.
- Escenarios de 20, 80 y 200 sobrevivientes.
- Contrato de carga de mapas.
- Estado para el frontend.

## Mapa y datos

La primera versión usa una cuadrícula demo de 25 nodos. No representa todavía
las calles reales de Manta. El formato para sustituirla por una exportación
validada de OpenStreetMap está documentado en
[data/README.md](data/README.md).

Los IDs `N-0001` y `N-0002` son identificadores técnicos. El estado y el mapa
también exponen nombres legibles de intersecciones y calles, por ejemplo
`Intersección Av. 4 de Noviembre / Calle 1` y `Av. 4 de Noviembre 1`. Al cargar
datos reales, esos nombres deben venir de la exportación de OpenStreetMap.

La regla de horda es configurable con `MANTA_HORDE_RADIUS`.

El cargador disponible es:

```python
from src.graph import CityGraph

graph = CityGraph.from_dict(map_data)
```

## Integración con el integrante 2

Flujo recomendado por turno:

```text
1. El motor de rutas llama POST /paso.
2. Recibe siguienteNodo.
3. Confirma el movimiento mediante move_survivor().
4. El simulador conserva nodoAnterior y nodo actual.
5. Se detectan mordidas y cruces.
6. El frontend consulta GET /estado.
```

El servicio también expone directamente:

```python
service.move_survivor("S-0001", "N-0014")
```

## Estructura del proyecto

```text
README.Md
data/
  README.md
src/
  graph.py       # Grafo y carga/exportación del mapa
  model.py       # Entidades y estado del mundo
  routing.py     # Dijkstra, alternativas y seguridad de movimientos
  cache.py       # Caché LRU de rutas por estado de peligro
  scenarios.py   # Rondas 1, 2 y 3
  server.py      # API HTTP
  service.py     # Fachada del sistema
  simulator.py   # Reglas y turnos del apocalipsis
  turn_loop.py   # Reloj automático de 2 segundos
tests/
  test_routing.py
```

## Limitaciones actuales

- El mapa todavía es un fixture de 25 nodos.
- El estado todavía no está persistido en DynamoDB o Redis.
- El backend todavía no está desplegado en AWS.
- No hay frontend Leaflet publicado.
- La API key es una variable de entorno local.
- La capacidad de refugios y la flota de rescate son funcionalidades PRO
  pendientes.

## Próximos pasos del equipo

1. Sustituir el grafo demo por datos reales validados de OpenStreetMap.
2. Construir el panel Leaflet y conectarlo a `/mapa`, `/estado` y `/ruta/{id}`.
3. Desplegar API, estado y frontend en AWS.
4. Agregar AWS Budget, CloudWatch, diagrama de arquitectura y declaración de
   costos.
