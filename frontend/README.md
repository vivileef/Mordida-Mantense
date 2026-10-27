# Mordida Mantense — frontend

Proyecto de **Brujas de la Nube** para SpookyThon 2026, Track A: **Escape de Manta Zombie**.

Centro de operaciones visual para el reto **Escape de Manta Zombie**. Está construido con React, Vite, Leaflet y React Leaflet. El modo inicial es `DEMO`: sus posiciones, rutas y eventos son ficticios y están marcados en la interfaz.

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

El build queda en `frontend\dist`.

## 2. Probar DEMO

Al abrir la aplicación se muestra `DEMO · DATOS SIMULADOS`. Cada dos segundos cambia el turno y se mueve al menos una amenaza o sobreviviente. El panel de eventos agrega cambios de horda y despertares simulados.

- **Pausar/Reanudar** detiene o retoma el reloj de demostración.
- **Reiniciar demo** vuelve a la posición inicial.
- **DEMO/API REAL** cambia de fuente sin mezclar los estados.
- Un clic sobre un sobreviviente o una tarjeta de ruta selecciona su ruta y muestra sus detalles.

Las posiciones del DEMO son coordenadas ficticias sobre el área de Manta; no representan una observación real.

## 3. Conectar el backend

Edita `.env` (no se deben subir credenciales):

```dotenv
VITE_API_BASE_URL=http://localhost:8080
VITE_POLL_INTERVAL_MS=2000
VITE_API_TIMEOUT_MS=5000
VITE_DATA_MODE=demo
```

Luego reinicia `npm run dev` y selecciona **API REAL**. `VITE_DATA_MODE=api` permite abrir directamente en modo API; el valor `demo` mantiene el modo DEMO por defecto. El adaptador consulta `GET /estado` cada ciclo y `GET /mapa` al iniciar API o mediante una acción explícita de refresco del mapa; así no se descarga el grafo estático cada dos segundos. Ambas respuestas se validan, se aplica un timeout configurable y, si una consulta falla, se conserva el último estado válido y se muestra el error. La función `requestNextStep` deja preparado el contrato `POST /paso` para una acción explícita de planificación; no se llama para todos los sobrevivientes desde el navegador.

El backend de este repositorio se inicia desde la raíz con:

```powershell
$env:MANTA_API_KEY = "clave-local"
python -m src.server
```

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
- El mapa base utiliza los tiles públicos de OpenStreetMap centrados inicialmente en `-0.9677, -80.7089`. Las conexiones del grafo y las rutas solo se dibujan como líneas cuando incluyen geometría vial; no se convierten automáticamente pares de nodos en líneas rectas.

### Información requerida del backend

El adaptador principal está en `src/services/simulatorApi.js`. El frontend espera que `GET /estado` incluya al menos `turno`, `zombies`, `sobrevivientes`, `refugios`, `aristasBloqueadas`, `eventos` y `nodos`. Cada nodo debe tener `id`, `lat` y `lng`; cada zombie debe tener `id`, `tipo` y `nodo`; cada sobreviviente debe tener `id`, `nodo`, `refugioId` y `activo`. Además, `GET /mapa` debe incluir `nodos` y `calles` con `origen`, `destino` y una geometría de vía (`geometry.coordinates` GeoJSON como `[longitud, latitud]`, o una lista equivalente de puntos). Para dibujar rutas reales, `GET /estado` debe incluir `rutas` con al menos `survivorId`, `geometry`/`coordinates` de la ruta siguiendo las calles y, si aplica, `status`, origen, destino y refugio asignado. `POST /paso` por sí solo devuelve un siguiente nodo y no proporciona geometría suficiente para pintar una ruta. Si el backend compartido utiliza otros nombres o todavía no entrega geometría, el panel lo indica y no reutiliza rutas DEMO. El equipo debe acordar y completar el adaptador en ese archivo antes de activar API REAL.
