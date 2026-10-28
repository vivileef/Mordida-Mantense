# Integración frontend–backend

Este documento describe lo que el frontend de esta rama consume hoy. Sirve
como lista de verificación cuando se integre la nueva implementación del
backend; no establece un contrato nuevo ni asume que la implementación nueva
ya fue probada.

## Endpoints que usa el frontend

El adaptador se encuentra en `src/services/simulatorApi.js` y
`src/services/simulatorApiCore.js`. En desarrollo, Vite envía las solicitudes
`/api/*` al host configurado en `VITE_API_BASE_URL` (por defecto,
`http://localhost:8080`) y retira el prefijo `/api`.

| Uso | Método y ruta | Entrada que envía el frontend | Respuesta que necesita |
|---|---|---|---|
| Estado periódico e inicial | `GET /estado` | Ninguna | Objeto con `turno`; arrays `zombies`, `sobrevivientes`, `refugios`, `aristasBloqueadas`, `eventos` y, si se publica, `eventosProgramados`. El estado local actual no incluye `rutas`; para estas se consulta el endpoint individual. El frontend también admite algunos alias (`nodes`, `survivors`, `blockedEdges`, etc.). |
| Grafo al entrar en API y al refrescarlo manualmente | `GET /mapa` | Ninguna | `nodos`/`nodes` y `calles`/`streets`. Cada nodo requiere `id`, `lat`, `lng`; cada calle requiere `origen`, `destino` y puede incluir `nombre`, `tipo`, distancia y geometría GeoJSON. |
| Ruta del sobreviviente seleccionado cuando `GET /estado` no trae `rutas` | `GET /ruta/{sobrevivienteId}` | ID en la ruta | Objeto con `sobrevivienteId`, `refugioId`, `nodos`, `calles`, `distancia_m` y `alternativas`; el backend local responde 404 con `Ruta segura no encontrada` cuando no hay una ruta segura. |
| Selección explícita de ronda | `POST /escenario` | `{ "escenario": "ronda1" }`, `ronda2` o `ronda3` | Cualquier respuesta JSON de éxito; luego el frontend vuelve a consultar `/estado`. El cuerpo de éxito no se usa como estado del mundo. |
| Siguiente movimiento de la persona seleccionada | `POST /paso` | `{ "sobrevivienteId": string, "nodoActual": string, "turno": number }` | Un `siguienteNodo` identificable. Si el backend indica que permanece en el nodo actual, el frontend no confirma un movimiento. |
| Confirmación explícita del paso | `POST /mover-sobreviviente` | `{ "sobrevivienteId": string, "nodoDestino": string }` | `movido: true`; después el frontend refresca `/estado`. |

`GET /estado` se consulta con polling (2.000 ms por defecto). `GET /mapa` no
se descarga en cada sondeo: se carga al entrar al modo API o al pulsar
**Actualizar mapa**. La interfaz no usa WebSocket.

## Datos necesarios para dibujar el mundo

- Las coordenadas GeoJSON `LineString.coordinates` se interpretan como
  `[longitud, latitud]` y se convierten a `[latitud, longitud]` para Leaflet.
- Los IDs de nodos, calles, entidades y refugios se conservan internamente.
  El mapa y los paneles usan nombres legibles cuando los entrega la API/OSM;
  si no, muestran etiquetas genéricas sin derivarlas del ID.
- Para cada ruta, el frontend admite `sobrevivienteId`/`survivorId` y
  `nodos`/`nodes`, preservando su orden. Cada par consecutivo debe tener una
  conexión en `/mapa`. Si una conexión tiene geometrías paralelas, el backend
  debería incluir el nombre del tramo en `calles` para que el frontend pueda
  elegirlo sin adivinar. Si la API envía geometría válida para el tramo, esta
  se conserva.
- Si `/mapa` omite geometría, el frontend solo intenta reutilizar la red local
  después de comprobar que coinciden todos los IDs, coordenadas y conexiones
  dirigidas. Una incompatibilidad produce una advertencia; no se dibuja una
  línea recta para reemplazar datos faltantes.
- `aristasBloqueadas` se consume actualmente como una lista de pares de IDs,
  por ejemplo `[["N-1", "N-2"]]`. Deben ser conexiones del mapa. La capa
  bloqueada se representa aparte de las calles abiertas.
- Zombies y sobrevivientes necesitan `id`, `nodo`/`node` y su tipo/estado; los
  refugios necesitan `id` y `nodo`/`node`. Una entidad cuyo nodo no esté en el
  mapa se omite con un aviso, sin asignarle coordenadas ficticias.
- Una lista vacía de rutas, bloqueos o eventos se presenta como dato vacío del
  estado recibido. Si falta el campo, la interfaz lo informa como ausente en
  vez de confundirlo con una lista vacía. Ninguno de los dos casos se
  interpreta por sí solo como una falla del algoritmo.

## Bloqueo manual y recálculo local

En DEMO, el control **Bloquear calle** cambia el estado del servicio de
demostración, mantiene el par dirigido de nodos y recalcula las rutas con
Dijkstra ponderado por `distancia_m`. Solo utiliza conexiones existentes y
respeta su dirección. El reinicio de DEMO restaura su mundo inicial.

En modo API, el mismo control crea una superposición local para probar el
bloqueo y el recálculo. No envía solicitudes al backend ni persiste los
cambios. **Restablecer estado API** descarta las superposiciones y recupera
el estado publicado por el servidor. Mientras exista una superposición
compatible con el grafo actual, los controles de avance API quedan
deshabilitados para no avanzar una simulación que no conoce ese bloqueo.

El modelo actual de bloqueos identifica una calle por `[origen, destino]`.
Si hay calles paralelas entre el mismo par dirigido, el algoritmo no puede
bloquear una sola; la interfaz avisa que afectará todas las conexiones
paralelas de ese sentido. El bloqueo inverso se controla aparte cuando hay
un arco inverso en el grafo.

## Ejecución local en PowerShell

Terminal 1, desde la raíz del repositorio, usando el grafo local real y una
clave de desarrollo propia:

```powershell
$env:MANTA_GRAPH_PATH = "tools/grafo-manta/manta.json"
$env:MANTA_API_KEY = "clave-local"
python -m src.server
```

Terminal 2:

```powershell
cd "C:\Users\danna\SPOOKYTHON 2026\Mordida-Mantense\frontend"
$env:MANTA_API_KEY = "clave-local"
npm run dev
```

La clave se configura en el proceso local de Vite para que el proxy agregue el
header `x-api-key`; no se debe crear una variable `VITE_*` para la clave. Para
probar solo el frontend, ejecuta `npm test` y `npm run build` desde
`frontend`.

## Verificación del servicio desplegado (2026-10-28)

Se consultó el servicio público `https://mo-0cc1a19f32244c86ad2fc33562bddc2f.ecs.us-east-2.on.aws` sin enviar credenciales:

- `GET /salud` respondió HTTP 200 con `{"estado":"ok","turno":2576}`.
- `GET /mapa` respondió HTTP 200 con `nodos` y `calles`. La muestra de nodo contiene `id`, `nombre`, `lat` y `lng`; la muestra de calle contiene `origen`, `destino`, `distancia_m`, `tipo` y `nombre`.
- En esa respuesta se contaron 25 nodos y 80 calles; ninguna calle incluyó geometría. Los 25 IDs de nodo existen también en la red local, pero ésta tiene 709 nodos y 2.232 calles con geometría. La coincidencia parcial no demuestra que las conexiones y coordenadas sean equivalentes, por lo que no es seguro asignar geometrías locales a este grafo.
- El mapa del frontend consume esos campos, pero sin geometría ni compatibilidad completa no puede dibujar la red real de calles. El adaptador existente evita sustituirlos por líneas rectas o por geometrías incompatibles y muestra su aviso de compatibilidad.
- `GET /estado` sin credenciales respondió HTTP 401 (`API key inválida o ausente`). No se consultó con una clave. No se enviaron solicitudes POST porque alterarían el estado remoto.

La respuesta de `/` y la documentación/código local anuncian además `POST /paso`, `POST /simular-turno`, `POST /escenario`, `POST /mover-sobreviviente` y `GET /ruta/{sobrevivienteId}`. Los POST y `/ruta/{id}` no se ejercitaron contra el servicio desplegado. El frontend consulta `/ruta/{id}` para la persona seleccionada cuando `/estado` no incluye su ruta; ese GET es de solo lectura. El contrato local de `/simular-turno` acepta `{}` y responde `{"turno": number}`; el hook valida ese campo y vuelve a consultar `/estado`.

### Configuración segura para probar el host

En PowerShell, desde `frontend`, el host público puede seleccionarse sin incluir claves en variables `VITE_*`:

```powershell
$env:VITE_API_BASE_URL = "https://mo-0cc1a19f32244c86ad2fc33562bddc2f.ecs.us-east-2.on.aws"
$env:VITE_DATA_MODE = "api"
npm run dev
```

En desarrollo el proxy de Vite agrega `x-api-key` solo si el proceso local tiene `MANTA_API_KEY` configurada. No se proporciona ni se debe guardar una clave en el repositorio. Sin una clave autorizada, `/estado` y las acciones protegidas responderán 401. En un frontend estático de producción no hay proxy de Vite: se necesita un proxy/backend confiable que autentique al usuario e inyecte la clave; no se debe compilar la clave en el bundle del navegador.

Antes de considerar integrada la vista API, la responsable del backend debe confirmar/desplegar que `/mapa` publique el grafo vial real con geometrías compatibles con nodos y conexiones, y facilitar un mecanismo de autenticación adecuado para el navegador. La muestra actual de nombres no demuestra que sean nombres oficiales de OpenStreetMap.

## Comprobaciones al recibir el backend nuevo

1. Consultar `/mapa` y comparar el total de nodos, conexiones, geometrías y
   nombres con la fuente de grafo acordada. Confirmar que IDs y coordenadas
   estén en el mismo sistema que las entidades.
2. Consultar `/estado` y verificar los tipos de los campos anteriores, además
   de qué rutas, bloqueos y eventos se publican al inicio y después de cada
   turno. Confirmar explícitamente si `rutas` publica el plan completo o solo
   algunos movimientos.
3. Para cada ruta recibida, comprobar que sus nodos existen, que cada tramo es
   una conexión y que el orden va desde la posición actual hasta el destino.
   En conexiones paralelas, confirmar cómo `calles` identifica el tramo
   seleccionado (nombre u otro campo ya existente).
4. Revisar que cada bloqueo corresponda a una conexión real y que aparezca en
   `/estado` cuando se activa y desaparezca si el backend lo desbloquea.
5. Iniciar cada ronda mediante el selector y verificar cantidades, tipos,
   refugios, eventos y bloqueos en `/estado`. La interfaz preparada no prueba
   que los datos de cada ronda cumplan Track A.
6. Solicitar un paso para una persona, confirmar la respuesta de `/paso`, la
   aceptación de `/mover-sobreviviente` y el cambio correspondiente en el
   siguiente `/estado`. No disparar acciones para todas las personas sin un
   mecanismo acordado con el backend.
7. Mantener el mapa abierto durante varios sondeos y comprobar que cambien
   posiciones/rutas/bloqueos sin perder zoom. Desconectar la API y verificar
   aviso de datos desactualizados, reintento y vuelta a DEMO.
8. Probar con 200 sobrevivientes y los volúmenes de amenazas acordados en un
   navegador objetivo. Medir uso de memoria y respuesta visual; esto no mide
   por sí solo la latencia del motor ni el objetivo p95 de `/paso`.

## Confirmaciones pendientes para la responsable del backend

- ¿`/estado` publicará rutas completas por sobreviviente? El frontend actual
  resuelve la ruta de la persona seleccionada mediante `/ruta/{id}` cuando no
  viene incluida en el estado.
- ¿Las calles paralelas se distinguirán en `rutas[].calles` de forma suficiente
  para asociar cada segmento a la geometría de `/mapa`?
- ¿`aristasBloqueadas` conserva pares `[origen, destino]` y coincide con los
  IDs dirigidos de `/mapa`?
- ¿Cuándo se publican las rutas: al iniciar escenario, luego de cada turno o
  después de un evento/bloqueo?
- ¿Qué cantidades exactas de caminantes/zombies y turnos de eventos debe
  cumplir cada ronda? El código local inspeccionado anteriormente configuraba
  ocho caminantes para Ronda 1, por lo que esa cantidad requiere confirmación.
- ¿Qué alojamiento/proxy entregará autenticación y CORS al frontend estático?
  La clave `x-api-key` no puede incluirse en el bundle del navegador.
