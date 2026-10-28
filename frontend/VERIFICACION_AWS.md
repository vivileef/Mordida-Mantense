# Verificacion del backend desplegado y preparacion de produccion

Fecha de comprobacion: 2026-10-28. Se utilizaron solamente solicitudes de lectura `GET` y `OPTIONS`; no se enviaron solicitudes POST.

## Respuestas observadas

- `GET /salud`: HTTP 200; campos recibidos: `estado` y `turno`.
- `GET /mapa`: HTTP 200; 25 `nodos` y 80 `calles`, sin geometria GeoJSON `LineString`.
- `GET /estado` sin autenticacion: HTTP 401.
- `GET /ruta/S-0089` sin autenticacion: HTTP 401.
- Preflight `OPTIONS /mapa` con origen de prueba y solicitud de `x-api-key`: HTTP 204; CORS permite origen `*`, metodos GET/POST/OPTIONS y headers Content-Type y x-api-key. Esto no prueba el origen final ni la integracion autenticada en un navegador.

## Compatibilidad del grafo

La respuesta publica de `/mapa` coincide por ID con los 25 nodos del grafo local, pero ninguna de sus 80 conexiones dirigidas coincide con las 2.232 conexiones de `src/data/mantaRoadNetwork.json`. La respuesta tampoco trae geometrias. Por seguridad, el frontend no puede aplicar la geometria del grafo local a las conexiones AWS ni presentar estas calles como la red real de Manta.

## Configuracion del frontend

`frontend/.env.production` configura el URL publico de AWS y el modo API para el build de produccion. Contiene un URL publico, no una credencial. El URL local permanece en `.env`/`.env.example` para desarrollo. No se incluye `x-api-key` en el bundle.

El API desplegado requiere autenticacion para `/estado` y `/ruta/{sobrevivienteId}` segun los 401 observados sin credenciales. No habia una variable `MANTA_API_KEY` en el entorno de este proceso. No se leyo ningun `.env` ni se intento adivinar una clave. Una app estatica React no puede mantener privada una clave. Antes de habilitar API REAL en produccion, el equipo debe proveer un mecanismo seguro compatible con el backend: por ejemplo, un proxy de servidor controlado que conserve la clave y la agregue servidor a servidor, o autenticacion de usuario soportada por el backend.

## Pendientes para la responsable del backend

1. Publicar `/mapa` con geometrias reales o confirmar un grafo cuyas conexiones dirigidas y coordenadas sean compatibles con el frontend. El snapshot de 25 nodos/80 calles actual no es compatible con la red local de 709 nodos/2.232 conexiones.
2. Definir y probar el mecanismo seguro de autenticacion para la aplicacion web estatica. No poner la clave en `VITE_*` ni en el bundle.
3. Confirmar el contrato real de `/estado` y `/ruta/{id}` con credenciales autorizadas, incluyendo rutas, sobrevivientes, refugios, bloqueos y eventos. No se infieren respuestas autenticadas a partir de `/salud` o `/mapa`.
4. Confirmar CORS para el origen final del frontend cuando se conozca; el preflight actual permite `*`, pero no se probo el origen final.

## Publicacion pendiente

El README propone hosting estatico en S3 y CloudFront opcional. No se verificaron recursos existentes ni se desplego el frontend. Una vez resueltos geometria y autenticacion, generar con `npm run build`, publicar `frontend/dist` en la plataforma aprobada, configurar HTTPS/rutas de fallback y comprobar despues `/salud`, `/mapa`, estado autenticado, rutas y polling desde el dominio final. Tambien quedan pendientes aprobacion de plataforma, region, presupuesto AWS y validaciones de carga/Track A.
