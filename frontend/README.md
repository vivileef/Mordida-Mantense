# Mordida Mantense — frontend

Proyecto de **Brujas de la Noche** para SpookyThon 2026, Track A: **Escape de Manta Zombie**.

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
VITE_API_KEY=clave-local
VITE_POLL_INTERVAL_MS=2000
VITE_API_TIMEOUT_MS=5000
VITE_DATA_MODE=demo
```

Luego reinicia `npm run dev` y selecciona **API REAL**. `VITE_DATA_MODE=api` permite abrir directamente en modo API; el valor `demo` mantiene el modo DEMO por defecto. El adaptador consulta `GET /estado` y `GET /mapa`, envía `x-api-key` cuando `VITE_API_KEY` existe, aplica un timeout configurable, valida el JSON y reintenta la lectura periódicamente. Si una consulta falla, conserva el último estado válido y muestra el error. La función `requestNextStep` deja preparado el contrato `POST /paso` para una acción explícita de planificación; no se llama para todos los sobrevivientes desde el navegador.

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
- El servidor local exige `x-api-key`; en un despliegue real se recomienda colocar autenticación y CORS en la capa de API/gateway.
- Las rutas completas solo se muestran si el backend las incluye en el payload; `POST /paso` devuelve únicamente el siguiente nodo y no se invoca automáticamente desde el panel.

### Información requerida del backend

El adaptador principal está en `src/services/simulatorApi.js`. El frontend espera que `GET /estado` incluya al menos `turno`, `zombies`, `sobrevivientes`, `refugios`, `aristasBloqueadas`, `eventos` y `nodos`. Cada nodo debe tener `id`, `lat` y `lng`; cada zombie debe tener `id`, `tipo` y `nodo`; cada sobreviviente debe tener `id`, `nodo`, `refugioId` y `activo`. Además, `GET /mapa` debe incluir `nodos` y `calles` con `origen` y `destino`. Si el backend compartido utiliza otros nombres, el equipo debe acordar y completar el adaptador en ese archivo antes de activar API REAL.
