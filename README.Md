# Mordida Mantense

Motor de simulación para **Escape de Manta Zombie · Track A**. El proyecto
modela Manta como un grafo de calles, simula amenazas y sobrevivientes por
turnos de dos segundos, registra eventos de la ciudad y expone una API HTTP
para consultar el estado y solicitar el siguiente paso de una ruta.

> **Estado de esta rama (`main`):** MVP backend funcional y probado
> localmente. El mapa incluido es un grafo de desarrollo; la integración
> completa del frontend, el motor avanzado de rutas, las funciones PRO y el
> despliegue AWS se mantienen en ramas de trabajo separadas.

## Ramas del proyecto

El trabajo se organiza en ramas especializadas para mantener una integración
clara y revisable:

| Rama | Propósito | Enlace |
|---|---|---|
| `main` | Base estable del simulador y su API | [Ver `main`](https://github.com/vivileef/Mordida-Mantense/tree/main) |
| `frontend-AWS` | Dashboard React, mapa Leaflet y preparación del grafo OSM | [Ver `frontend-AWS`](https://github.com/vivileef/Mordida-Mantense/tree/frontend-AWS) |
| `feature/motor-rutas` | Motor avanzado de rutas, peligros, caché y pruebas de API | [Ver `feature/motor-rutas`](https://github.com/vivileef/Mordida-Mantense/tree/feature/motor-rutas) |
| `integrar-backend` | Integración de frontend, simulador, motor y herramientas del mapa | [Ver `integrar-backend`](https://github.com/vivileef/Mordida-Mantense/tree/integrar-backend) |

`main` es la referencia estable de esta documentación. Las capacidades de las
otras ramas deben integrarse y validarse antes de presentarse como parte de una
versión final.

## Contenido

- [Qué está implementado](#qué-está-implementado)
- [Arquitectura](#arquitectura)
- [Requisitos](#requisitos)
- [Instalación y ejecución](#instalación-y-ejecución)
- [API HTTP](#api-http)
- [Reglas de simulación](#reglas-de-simulación)
- [Escenarios de prueba](#escenarios-de-prueba)
- [Pruebas](#pruebas)
- [Configuración](#configuración)
- [Estructura del repositorio](#estructura-del-repositorio)
- [Limitaciones conocidas](#limitaciones-conocidas)
- [Próximos pasos](#próximos-pasos)

## Qué está implementado

### Simulador

- Reloj automático con un turno cada dos segundos.
- Caminantes: avanzan una calle cada dos turnos.
- Corredores: avanzan hasta dos calles por turno y persiguen sobrevivientes
  cercanos.
- Hordas: permanecen en su nodo y convierten su zona inmediata en un área de
  peligro para el planificador.
- Dormidos: permanecen ocultos hasta que un sobreviviente se acerca.
- Mordidas por compartir nodo o cruzarse en direcciones opuestas.
- Bloqueos de calles y eventos programados.
- Escenarios de 20, 80 y 200 sobrevivientes.

### API

- `GET /` — catálogo de endpoints.
- `GET /salud` — health check público.
- `GET /mapa` — nodos y calles del grafo.
- `GET /estado` — estado completo del mundo.
- `POST /paso` — siguiente nodo seguro para un sobreviviente.
- `POST /mover-sobreviviente` — confirma un movimiento válido.
- `POST /simular-turno` — avanza manualmente un turno.
- `POST /escenario` — carga una ronda de la prueba de fuego.

Los endpoints privados requieren la cabecera `x-api-key`. El servidor valida que
cada movimiento sea el mismo nodo o un vecino conectado por una calle abierta.

## Arquitectura

```text
Cliente / simulador
          |
          | HTTP + x-api-key
          v
    src/server.py
          |
          v
    src/service.py
       /          \
      v            v
 Simulador      Routing
src/simulator.py src/routing.py
      \            /
       v          v
        WorldState
        src/model.py
             |
             v
          CityGraph
          src/graph.py
```

El estado se mantiene en memoria dentro del proceso. El backend actual está
diseñado para desarrollo local y pruebas del contrato; todavía no representa
un despliegue multiinstancia en AWS.

## Requisitos

- Python 3.10 o superior.
- PowerShell, Bash o una terminal compatible.
- No se requieren dependencias externas para ejecutar el MVP actual.

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

Para cambiar el puerto:

```powershell
$env:PORT = "8081"
python -m src.server
```

Para detener el proceso:

```text
Ctrl + C
```

## API HTTP

### Autenticación

Las rutas privadas requieren:

```text
x-api-key: clave-local
```

Las rutas públicas son `/`, `/mapa` y `/salud`.

### Consultar el estado

```powershell
$headers = @{ "x-api-key" = "clave-local" }
Invoke-RestMethod `
  -Uri "http://localhost:8080/estado" `
  -Headers $headers
```

La respuesta incluye:

- Turno actual.
- Zombies, tipo, nodo y visibilidad.
- Sobrevivientes, nodo actual, nodo anterior y estado.
- Refugios.
- Calles bloqueadas.
- Eventos ocurridos y programados.
- Nodos del grafo.
- Rutas planificadas disponibles.

### Solicitar el siguiente paso

`POST /paso` recibe el contrato principal del Track A:

```powershell
$headers = @{ "x-api-key" = "clave-local" }
$body = @{
    sobrevivienteId = "S-0001"
    nodoActual = "N-0013"
    turno = 1
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:8080/paso" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $body
```

Respuesta:

```json
{
  "siguienteNodo": "N-0012"
}
```

El valor devuelto siempre es un vecino conectado por una calle abierta o el
mismo nodo cuando no existe un movimiento seguro.

### Consultar el mapa

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:8080/mapa"
```

Ejemplo de estructura:

```json
{
  "nodos": [
    { "id": "N-0001", "lat": -0.95, "lng": -80.72 }
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

### Avanzar un turno manualmente

```powershell
$headers = @{ "x-api-key" = "clave-local" }

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:8080/simular-turno" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body '{}'
```

También se puede bloquear una arista durante el turno:

```powershell
$body = @{
    aristaBloqueada = @("N-0013", "N-0014")
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:8080/simular-turno" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $body
```

### Cargar un escenario

```powershell
$headers = @{ "x-api-key" = "clave-local" }
$body = @{ escenario = "ronda3" } | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:8080/escenario" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $body
```

Escenarios disponibles:

| Escenario | Sobrevivientes | Amenazas | Eventos |
|---|---:|---|---|
| `ronda1` | 20 | Caminantes | Ninguno |
| `ronda2` | 80 | Caminantes, corredores y hordas | Puente en el turno 10 |
| `ronda3` | 200 | Todos los tipos, incluidos dormidos | Puente en el turno 10 y avenida en el turno 20 |

## Reglas de simulación

- **Caminante:** avanza una calle cada dos turnos.
- **Corredor:** avanza hasta dos calles por turno y persigue si detecta un
  sobreviviente a tres nodos o menos.
- **Horda:** permanece en su nodo; el planificador trata su nodo y vecinos como
  peligrosos.
- **Dormido:** es invisible hasta que un sobreviviente se encuentra a dos nodos
  o menos; entonces despierta como caminante.
- **Mordida:** ocurre si un sobreviviente y un zombie comparten nodo o se cruzan
  por la misma calle en direcciones opuestas.
- **Calle bloqueada:** queda cerrada en ambos sentidos.
- **Eventos:** se aplican automáticamente en el turno programado.

## Pruebas

Ejecutar la suite desde la raíz:

```powershell
python -m unittest discover -s tests -v
```

La suite cubre:

- Movimiento de los tipos de zombie.
- Turnos automáticos.
- Activación de dormidos.
- Mordidas y cruces opuestos.
- Validación de movimientos.
- Bloqueos y eventos.
- Escenarios de 20, 80 y 200 sobrevivientes.
- Contrato de carga de mapas.
- Estado público para clientes.

## Configuración

| Variable | Obligatoria | Valor por defecto | Uso |
|---|---|---|---|
| `MANTA_API_KEY` | Sí para iniciar el servidor | — | Clave de endpoints privados |
| `MANTA_RANDOM_SEED` | No | Aleatorio | Reproducibilidad de movimientos |
| `MANTA_HORDE_RADIUS` | No | `1` | Radio de peligro alrededor de hordas |
| `PORT` | No | `8080` | Puerto HTTP local |

Nunca guardes claves reales en el repositorio. Para AWS, la clave debe
administrarse mediante Secrets Manager o Parameter Store, no mediante código
fuente ni variables `VITE_*` del navegador.

## Estructura del repositorio

```text
src/
  graph.py          Modelo del grafo y mapa demo
  model.py          Entidades y estado del mundo
  routing.py        Compatibilidad y validación de pasos
  scenarios.py      Rondas de la prueba de fuego
  server.py         Adaptador HTTP
  service.py        Coordinación del simulador y la API
  simulator.py      Reglas de movimiento y mordidas
  turn_loop.py      Reloj automático de dos segundos
tests/
  test_routing.py   Pruebas del MVP backend
data/
  README.md         Notas sobre datos del mapa
```

## Limitaciones conocidas

Esta rama `main` todavía no incluye:

- Frontend React integrado en el historial de esta rama.
- Grafo real de Manta cargado por el backend.
- Despliegue público en AWS.
- API Gateway, Lambda, ECS, S3, CloudFront o CloudWatch configurados.
- AWS Budget y evidencia de costos.
- WebSocket o canal de eventos en tiempo real.
- Predicción avanzada de corredores.
- Asignación por capacidad de refugios.
- Flota de rescate PRO.
- Benchmark reproducible de las tres rondas en AWS.

Estas capacidades se desarrollan en ramas de integración y deben incorporarse
al código antes de marcarlas como entregadas en `main`.

## Próximos pasos de integración

1. Integrar el motor avanzado de rutas y sus pruebas de carga.
2. Cargar el grafo real de Manta y validar sus intersecciones.
3. Conectar el frontend al contrato de `/estado`, `/mapa` y `/paso`.
4. Completar las funciones PRO: predicción, refugios y rescate.
5. Automatizar la prueba de fuego con métricas de supervivencia, p95 y errores.
6. Desplegar la API y el frontend en AWS.
7. Añadir diagrama de arquitectura, AWS Budget y declaración de costos.

## Licencia y contribuciones

Este repositorio pertenece al proyecto **Mordida Mantense**. Antes de abrir un
pull request:

1. Ejecuta las pruebas.
2. Verifica que no existan claves o datos sensibles.
3. Documenta cambios de API y configuración.
4. Mantén los commits enfocados y descriptivos.
