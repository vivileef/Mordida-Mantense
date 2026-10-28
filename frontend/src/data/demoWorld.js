import roadNetwork from "./mantaRoadNetwork.json";

const center = [-0.9675, -80.7075];
const nodes = roadNetwork.nodos;
const streets = roadNetwork.calles;

function nearestNode(lat, lng) {
  return nodes.reduce((nearest, node) => {
    const distance = (node.lat - lat) ** 2 + (node.lng - lng) ** 2;
    return !nearest || distance < nearest.distance
      ? { id: node.id, distance }
      : nearest;
  }, null).id;
}

const selectedNodes = [
  nearestNode(-0.9675, -80.7075),
  nearestNode(-0.962, -80.710),
  nearestNode(-0.972, -80.704),
  nearestNode(-0.958, -80.700),
  nearestNode(-0.978, -80.712),
  nearestNode(-0.965, -80.700),
  nearestNode(-0.970, -80.716),
  nearestNode(-0.955, -80.708),
  nearestNode(-0.980, -80.705),
].filter((id, index, values) => id && values.indexOf(id) === index);

const baseWorld = {
  turno: 1,

  zombies: [
    { id: "Z-014", tipo: "caminante", nodo: selectedNodes[1], visible: true },
    { id: "Z-032", tipo: "corredor", nodo: selectedNodes[3], visible: true },
    {
      id: "H-003",
      tipo: "horda",
      nodo: selectedNodes[4],
      visible: true,
      cantidad: 14,
    },
    { id: "Z-021", tipo: "dormido", nodo: selectedNodes[5], visible: true },
    { id: "Z-055", tipo: "caminante", nodo: selectedNodes[6], visible: true },
  ],

  sobrevivientes: [
    { id: "S-0089", nodo: selectedNodes[2], refugioId: "R-001", activo: true },
    { id: "S-0112", nodo: selectedNodes[7], refugioId: "R-002", activo: true },
    { id: "S-0031", nodo: selectedNodes[8], refugioId: "R-001", activo: true },
    { id: "S-0204", nodo: selectedNodes[1], refugioId: "R-002", activo: true },
  ],

  refugios: [
    { id: "R-001", nodo: selectedNodes[0], capacidad: 100 },
    { id: "R-002", nodo: selectedNodes[5], capacidad: 80 },
    { id: "R-003", nodo: selectedNodes[7], capacidad: 60 },
    { id: "R-004", nodo: selectedNodes[8], capacidad: 45 },
  ],

  aristasBloqueadas: [[streets[0].origen, streets[0].destino]],
  calles: streets,
  nodos: nodes,
  rutas: [],
  eventos: [
    {
      turno: 1,
      tipo: "sistema",
      descripcion: "Demostración iniciada con datos simulados.",
    },
    {
      turno: 1,
      tipo: "calle",
      descripcion: `Calle ${streets[0].origen} → ${streets[0].destino} bloqueada.`,
    },
    {
      turno: 0,
      tipo: "refugio",
      descripcion: "Refugio R-001 operativo al 72% de capacidad.",
    },
  ],
};

function claveArista(a, b) {
  return [a, b].sort().join("|");
}

function buscarRuta(world, inicio, destino) {
  if (!inicio || !destino) return [];
  if (inicio === destino) return [inicio];

  const bloqueadas = new Set(
    (world.aristasBloqueadas ?? []).map(([a, b]) => claveArista(a, b)),
  );

  const grafo = new Map((world.nodos ?? []).map((nodo) => [nodo.id, []]));

  for (const calle of world.calles ?? []) {
    const { origen, destino: fin } = calle;

    if (!grafo.has(origen) || !grafo.has(fin)) continue;
    if (bloqueadas.has(claveArista(origen, fin))) continue;

    grafo.get(origen).push(fin);
    grafo.get(fin).push(origen);
  }

  if (!grafo.has(inicio) || !grafo.has(destino)) return [];

  const pendientes = [[inicio]];
  const visitados = new Set([inicio]);

  while (pendientes.length > 0) {
    const ruta = pendientes.shift();
    const actual = ruta[ruta.length - 1];

    if (actual === destino) return ruta;

    for (const vecino of grafo.get(actual) ?? []) {
      if (visitados.has(vecino)) continue;

      visitados.add(vecino);
      pendientes.push([...ruta, vecino]);
    }
  }

  return [];
}

function recalcularRutas(world) {
  for (const survivor of world.sobrevivientes) {
    if (!survivor.activo) continue;

    const shelter = world.refugios.find(
      (item) => item.id === survivor.refugioId,
    );

    const nodesInRoute = shelter
      ? buscarRuta(world, survivor.nodo, shelter.nodo)
      : [];

    const status = nodesInRoute.length > 0 ? "activa" : "invalida";

    const existingRoute = world.rutas.find(
      (route) => route.survivorId === survivor.id,
    );

    const updatedRoute = {
      survivorId: survivor.id,
      nodes: nodesInRoute,
      status,
      updatedAt: `turno ${world.turno}`,
    };

    if (existingRoute) {
      Object.assign(existingRoute, updatedRoute);
    } else {
      world.rutas.push(updatedRoute);
    }
  }

  return world;
}

function agregarEvento(world, tipo, descripcion) {
  world.eventos.unshift({
    turno: world.turno,
    tipo,
    descripcion,
  });

  world.eventos = world.eventos.slice(0, 12);
}

function bloquearSiguienteTramo(world, survivor) {
  const route = world.rutas.find(
    (item) =>
      item.survivorId === survivor.id &&
      item.status === "activa" &&
      item.nodes.length > 1,
  );

  if (!route) return false;

  const a = route.nodes[0];
  const b = route.nodes[1];

  const yaBloqueada = world.aristasBloqueadas.some(
    ([x, y]) => claveArista(x, y) === claveArista(a, b),
  );

  if (yaBloqueada) return false;

  world.aristasBloqueadas.push([a, b]);

  agregarEvento(
    world,
    "calle",
    `Calle ${a} → ${b} bloqueada. Recalculando ruta de ${survivor.id}.`,
  );

  recalcularRutas(world);

  const nuevaRuta = world.rutas.find((item) => item.survivorId === survivor.id);

  if (nuevaRuta?.status === "activa") {
    agregarEvento(
      world,
      "ruta",
      `Ruta alternativa calculada para ${survivor.id}.`,
    );
  } else {
    agregarEvento(
      world,
      "peligro",
      `No se encontró una ruta disponible para ${survivor.id}.`,
    );
  }

  return true;
}

function moverZombie(world, zombie) {
  const callesDisponibles = world.calles.filter((calle) => {
    const conectaConZombie =
      calle.origen === zombie.nodo || calle.destino === zombie.nodo;

    if (!conectaConZombie) return false;

    const bloqueada = world.aristasBloqueadas.some(
      ([a, b]) =>
        claveArista(a, b) === claveArista(calle.origen, calle.destino),
    );

    return !bloqueada;
  });

  if (callesDisponibles.length === 0) return;

  const calle = callesDisponibles[(world.turno - 1) % callesDisponibles.length];

  zombie.nodo = calle.origen === zombie.nodo ? calle.destino : calle.origen;
}

export function createDemoWorld() {
  const world = structuredClone(baseWorld);
  recalcularRutas(world);
  return world;
}

export function advanceDemoWorld(world) {
  const next = structuredClone(world);
  next.turno += 1;

  // Recalcular las rutas con los bloqueos actuales.
  recalcularRutas(next);

  // Cada cinco turnos se intenta bloquear el siguiente tramo
  // de la ruta del primer sobreviviente activo.
  if (next.turno % 5 === 0) {
    const survivor = next.sobrevivientes.find((item) => item.activo);

    if (survivor) {
      bloquearSiguienteTramo(next, survivor);
    }
  }

  // Mover un sobreviviente un tramo por su ruta disponible.
  const survivor = next.sobrevivientes.find((item) => item.activo);

  if (survivor) {
    const route = next.rutas.find(
      (item) => item.survivorId === survivor.id && item.status === "activa",
    );

    if (route && route.nodes.length > 1) {
      survivor.nodo = route.nodes[1];
      recalcularRutas(next);
    }
  }

  // Los zombis caminantes se desplazan por calles conectadas.
  const walker = next.zombies.find((zombie) => zombie.tipo === "caminante");

  if (walker) {
    moverZombie(next, walker);
  }

  if (next.turno % 4 === 0) {
    agregarEvento(
      next,
      "horda",
      "La horda H-003 cambió de dirección cerca de la avenida.",
    );
  }

  if (next.turno % 7 === 0) {
    const sleeper = next.zombies.find((zombie) => zombie.tipo === "dormido");

    if (sleeper) {
      sleeper.tipo = "corredor";

      agregarEvento(
        next,
        "peligro",
        `${sleeper.id} despertó: amenaza corredor detectada.`,
      );
    }
  }

  next.eventos = next.eventos.slice(0, 12);

  return next;
}

export { center };
