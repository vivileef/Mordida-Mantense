# Mordida Mantense

Proyecto del Track A **Escape de Manta Zombie**: un motor Python que simula
amenazas y sobrevivientes sobre un grafo vial, una API HTTP para consultar el
mundo y un dashboard React con mapa de Manta. El modo DEMO del frontend puede
ejecutarse sin el backend. En API REAL, el frontend consulta el servidor Python.

## Componentes

- `src/`: grafo, estado del mundo, simulador, planificador de rutas y API.
- `frontend/`: dashboard React + Vite, mapa Leaflet y adaptador de API.
- `data/` y `tools/grafo-manta/`: datos y documentación de la red vial.
- `tests/`: pruebas automatizadas del motor Python.
- `scripts/load_test.py`: herramienta para medir solicitudes HTTP al motor.

La red vial local de Manta contiene 709 nodos y 2.232 calles. El grafo pequeño
de 25 nodos sigue disponible como fixture del motor. Consulta
[`data/README.md`](data/README.md) y [`frontend/README.md`](frontend/README.md)
para detalles de los datos y la interfaz.

## Requisitos

- Python 3.10 o superior. El backend usa la biblioteca estándar de Python.
- Node.js 18 o superior y npm para el frontend.

## Inicio rápido

### Backend

Desde la raíz, configura una clave local y arranca el servidor:

```powershell
$env:MANTA_API_KEY = "clave-local"
python -m src.server
```

El servidor escucha en `http://localhost:8080` y avanza automáticamente un
turno cada dos segundos. Para detenerlo, usa `Ctrl+C`. También puedes definir
`PORT` (predeterminado `8080`), `MANTA_CORS_ORIGIN` (predeterminado `*`) y
`MANTA_HORDE_RADIUS` (predeterminado `1`; usa `0` para marcar solo el nodo de
la horda).

### Frontend

En otra terminal:

```powershell
cd frontend
npm install
npm run dev
```

Vite muestra la dirección local, normalmente `http://localhost:5173`. El modo
DEMO usa datos de presentación; sus entidades no representan personas ni
amenazas reales. Para conectar API REAL, configura `VITE_API_BASE_URL` según
[`frontend/README.md`](frontend/README.md). En desarrollo, el proxy de Vite
puede usar `MANTA_API_KEY` desde el entorno del proceso. No pongas claves
privadas en variables `VITE_*`: esas variables quedan incluidas en el bundle
del navegador.

## API HTTP

Las rutas privadas requieren la cabecera `x-api-key`, configurada al iniciar el
backend. `GET /`, `GET /mapa` y `GET /salud` son públicas.

| Método y ruta | Acceso | Función |
|---|---|---|
| `GET /` | Público | Lista los endpoints disponibles. |
| `GET /salud` | Público | Comprueba el estado del servidor. |
| `GET /mapa` | Público | Devuelve nodos y calles del grafo cargado. |
| `GET /estado` | Protegido | Devuelve el estado del mundo. |
| `GET /ruta/{sobrevivienteId}` | Protegido | Devuelve los detalles de ruta del sobreviviente. |
| `POST /paso` | Protegido | Calcula el siguiente nodo para un sobreviviente. |
| `POST /mover-sobreviviente` | Protegido | Confirma un movimiento válido. |
| `POST /simular-turno` | Protegido | Avanza manualmente un turno; acepta un cierre de calle opcional. |
| `POST /escenario` | Protegido | Carga `ronda1`, `ronda2` o `ronda3`. |

Ejemplo de consulta al estado:

```powershell
curl.exe -H "x-api-key: clave-local" http://localhost:8080/estado
```

Las rondas crean 20, 80 o 200 sobrevivientes. Las reglas y cantidades de
amenazas se implementan en `src/scenarios.py`; valida su correspondencia con
las especificaciones vigentes del reto antes de usarlas como resultados
oficiales.

## Desarrollo

Ejecuta las pruebas Python desde la raíz:

```powershell
python -m unittest discover -s tests -v
```

Pruebas del frontend, desde `frontend/`:

```powershell
npm test
```

Compila el frontend para producción con `npm run build`; los archivos quedan
en `frontend/dist`. El repositorio no documenta un despliegue de producción
completo. La publicación estática requiere resolver la autenticación del API
en una capa segura del lado servidor; nunca expongas `MANTA_API_KEY` en el
navegador.

## Mapa y atribución

La red vial local deriva de OpenStreetMap. Conserva la atribución y respeta la
licencia ODbL y las políticas de uso de los tiles. Consulta los README de
[`data/`](data/README.md), [`frontend/`](frontend/README.md) y
[`tools/grafo-manta/`](tools/grafo-manta/README.md) para procedencia y detalles
de formato.
