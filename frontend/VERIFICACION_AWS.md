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

## Puerta para el despliegue real

**Estado: bloqueado para API REAL.** La URL de AWS y `VITE_DATA_MODE=api` estan preparadas en `.env.production`, pero eso solo selecciona el backend en el build. No se encontro configuracion de hosting (plantillas de infraestructura, workflow de despliegue ni dominio) y no se verificaron buckets o distribuciones. El README del repositorio propone S3 para archivos estaticos y CloudFront opcional; es una propuesta documentada, no infraestructura lista.

Los dos bloqueos que deben cerrarse antes de publicar en modo API son:

1. **Autenticacion:** `/estado` devuelve 401 sin credenciales. No compilar una clave privada en React ni guardarla en `VITE_*`. La responsable debe confirmar un proxy de servidor confiable que almacene e inyecte la clave, o un flujo de autenticacion de usuario admitido por el backend. `/ruta/{id}` tambien debe verificarse de forma autenticada.
2. **Grafo vial:** el `/mapa` publico entrega 25 nodos y 80 calles sin geometria; sus conexiones dirigidas no coinciden con el snapshot local de 709 nodos/2.232 calles. La responsable debe publicar geometria vial real y compatible, o confirmar el contrato/red que el frontend debe representar. El frontend no debe suplir esas calles con geometria DEMO.

### Confirmaciones de la responsable del backend

- Mecanismo de autenticacion para navegador y URL publica del proxy, si esa es la solucion elegida.
- Respuestas autenticadas de `/estado` y `/ruta/{sobrevivienteId}`, incluyendo la presencia y forma de zombis, sobrevivientes, refugios, rutas, bloqueos y eventos.
- Que los `nodo`/`nombreNodo` de las entidades pertenezcan a los IDs de `/mapa`.
- Geometrias reales de calles, conexiones dirigidas e IDs compatibles entre mapa, rutas y bloqueos.
- Origen del frontend que se permitira en CORS; el preflight con `*` desde un origen de prueba no valida el dominio definitivo.

### Pasos para publicar despues de resolver los bloqueos

1. Aprobar hosting, dominio, cuenta y region AWS. Segun la documentacion existente, usar S3 para el hosting estatico y decidir si CloudFront es necesario. Confirmar tambien presupuesto/alertas; no hay recursos ni alerta verificados aqui.
2. Implementar y probar la autenticacion del lado servidor con la responsable; mantener la credencial fuera del navegador. Si se usa un proxy, establecer `VITE_API_BASE_URL` al URL publico aprobado del proxy, no incluir ninguna clave.
3. Actualizar `/mapa` en el backend con la geometria y red compatibles y confirmar CORS para el origen definitivo (o usar un proxy de mismo origen).
4. Configurar para el build las variables publicas ya soportadas: `VITE_API_BASE_URL` y `VITE_DATA_MODE=api`. `VITE_POLL_INTERVAL_MS` y `VITE_API_TIMEOUT_MS` solo se necesitan si el equipo decide cambiar sus valores actuales. No agregar secretos como `VITE_*`.
5. Desde `frontend`, ejecutar `npm run build` y publicar el contenido de `frontend/dist` en el hosting aprobado. Configurar HTTPS y fallback SPA si la plataforma lo requiere.
6. Desde el dominio publicado, validar en navegador el estado autenticado, grafo y geometria, ubicacion de entidades, rutas, refugios, bloqueos, eventos, polling, errores 401/red y conservacion de zoom. La integracion no se considera terminada hasta completar esta validacion visual contra el sitio publicado.
