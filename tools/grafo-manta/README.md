# Grafo real de Manta

Este directorio prepara una utilidad independiente para descargar y transformar la red vial real de Manta, Manabí, Ecuador, usando Python, OSMnx y NetworkX.

## Objetivo

- Descargar la red de calles de Manta desde OpenStreetMap.
- Guardar el grafo original en `manta.graphml`.
- Exportar un formato JSON compatible con el contrato documental del proyecto (`nodos` y `calles`).
- Probar una ruta mínima con distancia como peso y verificar que los nodos consecutivos estén conectados.
- Mantener los datos separados del frontend y del backend, sin inventar coordenadas ni reemplazar el simulador actual.

## Requisitos

- Python 3.11+ recomendado.
- Entorno virtual local.
- Conexión a internet para consultar OpenStreetMap.

## Instalación en Windows PowerShell

```powershell
cd C:\Users\danna\SPOOKYTHON 2026\Mordida-Mantense
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r tools\grafo-manta\requirements.txt
```

## Ejecución

### Descarga completa

```powershell
python tools\grafo-manta\generar_grafo.py --place "Manta, Manabí, Ecuador"
```

### Descarga limitada por bounding box

```powershell
python tools\grafo-manta\generar_grafo.py --bbox "-80.760,-0.990,-80.640,-0.900"
```

### Validación de ruta

```powershell
python tools\grafo-manta\generar_grafo.py --place "Manta, Manabí, Ecuador" --validate-route
```

### Modo sin descarga

```powershell
python tools\grafo-manta\generar_grafo.py --dry-run --place "Manta, Manabí, Ecuador"
```

### Endpoint alternativo de Overpass

OSMnx 2.1.1 configura el servicio mediante `ox.settings.overpass_url`.
La herramienta lo expone sin cambiar los argumentos existentes:

```powershell
python tools\grafo-manta\generar_grafo.py `
  --overpass-url "https://overpass.kumi.systems/api" `
  --bbox "-80.760,-0.990,-80.640,-0.900"
```

También se puede configurar por sesión:

```powershell
$env:MANTA_OVERPASS_URL = "https://overpass.kumi.systems/api"
python tools\grafo-manta\generar_grafo.py --bbox "-80.760,-0.990,-80.640,-0.900"
```

Antes de usar un endpoint indicado por `--overpass-url` o
`MANTA_OVERPASS_URL`, el script consulta su ruta `/status`. Si no responde
correctamente, el endpoint alternativo se rechaza y no se inicia la descarga.
El valor por defecto sigue siendo el endpoint configurado por OSMnx.

Cuando Overpass devuelve saturación, HTTP 429/5xx o un timeout, se hacen como
máximo tres reintentos con espera progresiva (5, 10 y 20 segundos). Se puede
ajustar de forma acotada:

```powershell
python tools\grafo-manta\generar_grafo.py `
  --retries 2 `
  --retry-delay 10 `
  --bbox "-80.760,-0.990,-80.640,-0.900"
```

## Archivos generados

- `tools/grafo-manta/manta.graphml`: grafo original descargado de OSM y serializado por OSMnx.
- `tools/grafo-manta/manta.json`: exportación del grafo en el formato documental del proyecto.

## Estructura de `manta.json`

```json
{
  "nodos": [
    {"id": "N-0001", "lat": -0.9677, "lng": -80.7089},
    {"id": "N-0002", "lat": -0.9681, "lng": -80.7090}
  ],
  "calles": [
    {
      "origen": "N-0001",
      "destino": "N-0002",
      "distancia_m": 128.5,
      "tipo": "primary",
      "sentido": "bidireccional"
    }
  ]
}
```

Este esquema conserva el contrato actual del proyecto y añade `sentido` para documentar la circulación cuando OSM lo indica.

## Limitaciones

- `osmnx` depende de una red disponible para construir la consulta geográfica.
- Los servicios públicos de Overpass tienen capacidad limitada, colas,
  límites de uso y mantenimiento; un HTTP 502 no implica que los datos estén
  disponibles en otro endpoint.
- El endpoint alternativo debe ser compatible con la API `/api/interpreter` que
  usa OSMnx y responder a `/api/status`. La comprobación de estado solo prueba
  disponibilidad básica, no garantiza que una consulta posterior no sea
  rechazada por saturación.
- Si la consulta falla, la descarga no debe tratarse como exitosa.
- El trabajo real de rutas sobre calles requiere confirmar el formato final con el backend.
- El grafo puede resultar grande si se descarga la ciudad completa; por eso se ofrece el límite por `--bbox`.
- La información de sentido de circulación depende de la calidad de los datos de OSM.

## Regeneración del grafo

Cuando se quiera actualizar la topología:

1. Activar el entorno virtual.
2. Ejecutar `generar_grafo.py`, usando `--bbox` si la consulta completa es
   demasiado grande.
3. Revisar `manta.graphml` y `manta.json`.
4. Confirmar que la validación de ruta pase para al menos una prueba representativa.
5. Documentar cualquier cambio del contrato antes de integrarlo con el frontend o el backend.

## Qué queda pendiente para integración

- Definir con la responsable del backend el formato final de rutas reales del mundo.
- Confirmar si el frontend usará `nodos`/`calles` directamente o un contrato más completo con geometría de rutas.
- Acordar si las calles bloqueadas, refugios y vivas de zombies se modelan en el mismo grafo o en capas separadas.

Este directorio no reemplaza el backend ni el frontend, y no debe usarse para afirmar que la ruta real ya está integrada si la descarga no se ejecutó correctamente.

## Validación local y validación con Internet

La validación que no requiere Internet es:

```powershell
python tools\grafo-manta\generar_grafo.py --dry-run
```

También se puede probar `validate_route_json` con un payload creado en una
prueba local, sin llamar a OSM. La descarga con `--place`, `--bbox` o
`--validate-route` requiere Internet: la ruta solo puede validarse después de
que OSMnx haya descargado y exportado un grafo real. Esta herramienta no
genera nodos, calles ni resultados sustitutos si Overpass falla.
