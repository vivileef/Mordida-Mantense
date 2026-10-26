# Mordida Manta

Motor inicial para el reto **Escape de Manta Zombie**. Esta versión implementa
un grafo de ejemplo, rutas seguras con A*, estado del mundo y los endpoints
requeridos por el simulador.

## Ejecutar localmente

Requiere Python 3.10 o superior. No necesita instalar dependencias:

```powershell
$env:MANTA_API_KEY = "clave-local"
python -m src.server
```

En otra terminal:

```powershell
curl.exe http://localhost:8080/
curl.exe -H "x-api-key: clave-local" http://localhost:8080/estado
curl.exe -X POST http://localhost:8080/paso `
  -H "Content-Type: application/json" `
  -H "x-api-key: clave-local" `
  -d '{\"sobrevivienteId\":\"S-0001\",\"nodoActual\":\"N-0013\",\"turno\":0}'
```

## Pruebas

```powershell
python -m unittest discover -s tests -v
```

## Contrato

- `GET /estado`: devuelve turno, zombies, sobrevivientes, refugios y aristas bloqueadas.
- `POST /paso`: recibe `sobrevivienteId`, `nodoActual` y `turno`; responde
  `{"siguienteNodo":"..."}`.
- `POST /simular-turno`: avanza un turno del apocalipsis. Puede recibir
  `{"aristaBloqueada":["N-0013","N-0014"]}` para simular un cierre de calle.
- Todas las rutas requieren la cabecera `x-api-key`.
- Si una ruta no es segura o no existe, el sobreviviente permanece en su nodo.

El motor mueve caminantes cada dos turnos, corredores hasta dos calles por turno,
despierta dormidos cuando se acercan sobrevivientes, registra bloqueos y marca
sobrevivientes mordidos. El avance es explícito mediante `/simular-turno` para
que consultar `/estado` no cambie el mundo accidentalmente.

## Primera versión y siguientes pasos

El mapa actual es una cuadrícula de 25 nodos para validar el motor. El siguiente
paso es conectar el simulador de turnos, persistir el estado en DynamoDB,
reemplazar el grafo por datos de OpenStreetMap y publicar el frontend con
Leaflet en S3/CloudFront.