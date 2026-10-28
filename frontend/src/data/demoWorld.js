import roadNetwork from "./mantaRoadNetwork.json" with { type: "json" };
import {
  isDirectedEdgeBlocked,
  recalculateWorldRoutes,
  setWorldEdgeBlocked,
} from "../services/roadRouting.js";

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

  rescate: {
    vehiculos: [{
      id: "V-001",
      nombre: "Ambulancia 1",
      nodo: selectedNodes[0],
      capacidad: 4,
      estado: "disponible",
      fase: "disponible",
      pasajeros: [],
    }],
    asignaciones: [],
  },

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

function recalcularRutas(world) {
  const recalculated = recalculateWorldRoutes(world);
  world.rutas = recalculated.rutas;
  world.advertenciasRutasLocales = recalculated.advertenciasRutasLocales;
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

  const update = setWorldEdgeBlocked(world, a, b, true);
  if (!update.ok || !update.changed) return false;
  Object.assign(world, update.world);

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
  const callesDisponibles = world.calles.filter((calle) =>
    String(calle.origen) === String(zombie.nodo) &&
    !isDirectedEdgeBlocked(world.aristasBloqueadas, calle.origen, calle.destino),
  );

  if (callesDisponibles.length === 0) return;

  const calle = callesDisponibles[(world.turno - 1) % callesDisponibles.length];

  zombie.nodo = calle.destino;
}

function findRoadPath(world, origin, destination) {
  const start = String(origin);
  const end = String(destination);
  if (start === end) return [start];
  const queue = [[start]];
  const visited = new Set([start]);
  while (queue.length) {
    const path = queue.shift();
    const current = path[path.length - 1];
    const exits = world.calles
      .filter((street) => String(street.origen) === current)
      .filter((street) => !isDirectedEdgeBlocked(world.aristasBloqueadas, current, street.destino))
      .map((street) => String(street.destino))
      .sort();
    for (const next of exits) {
      if (visited.has(next)) continue;
      const candidate = [...path, next];
      if (next === end) return candidate;
      visited.add(next);
      queue.push(candidate);
    }
  }
  return null;
}

function advanceRescue(world) {
  const vehicle = world.rescate?.vehiculos?.[0];
  if (!vehicle) return;
  if (vehicle.fase === "disponible") {
    const candidates = world.sobrevivientes
      .filter((survivor) => survivor.activo && !survivor.rescatado && !survivor.rescateEnCurso)
      .map((survivor) => ({ survivor, path: findRoadPath(world, vehicle.nodo, survivor.nodo) }))
      .filter((item) => item.path)
      .sort((a, b) => a.path.length - b.path.length);
    const assignment = candidates[0];
    if (!assignment) return;
    vehicle.sobrevivienteId = assignment.survivor.id;
    vehicle.refugioId = assignment.survivor.refugioId;
    vehicle.ruta = assignment.path.slice(1);
    vehicle.fase = "recogida";
    vehicle.estado = "en camino";
    assignment.survivor.rescateEnCurso = true;
    world.rescate.asignaciones = [{ vehiculoId: vehicle.id, sobrevivienteId: assignment.survivor.id }];
    agregarEvento(world, "rescate", `${vehicle.nombre} va a recoger a ${assignment.survivor.id}.`);
  }

  const survivor = world.sobrevivientes.find((item) => String(item.id) === String(vehicle.sobrevivienteId));
  const moveOneStep = () => {
    if (vehicle.ruta?.length) vehicle.nodo = vehicle.ruta.shift();
  };
  if (vehicle.fase === "recogida") {
    moveOneStep();
    if (String(vehicle.nodo) === String(survivor?.nodo)) {
      vehicle.fase = "traslado";
      vehicle.estado = "trasladando sobreviviente";
      vehicle.pasajeros = [survivor.id];
      survivor.abordo = true;
      survivor.estado = "En traslado al refugio";
      agregarEvento(world, "rescate", `${vehicle.nombre} recogió a ${survivor.id}; se dirige al refugio.`);
      const refuge = world.refugios.find((item) => String(item.id) === String(vehicle.refugioId));
      vehicle.ruta = refuge ? (findRoadPath(world, vehicle.nodo, refuge.nodo)?.slice(1) ?? []) : [];
    }
  } else if (vehicle.fase === "traslado") {
    moveOneStep();
    if (survivor) survivor.nodo = vehicle.nodo;
    const refuge = world.refugios.find((item) => String(item.id) === String(vehicle.refugioId));
    if (refuge && String(vehicle.nodo) === String(refuge.nodo)) {
      survivor.abordo = false;
      survivor.rescateEnCurso = false;
      survivor.rescatado = true;
      survivor.estado = "Rescatado";
      vehicle.pasajeros = [];
      vehicle.sobrevivienteId = undefined;
      vehicle.ruta = [];
      vehicle.fase = "disponible";
      vehicle.estado = "disponible";
      vehicle.refugioId = undefined;
      world.rescate.asignaciones = [];
      agregarEvento(world, "rescate", `${survivor.id} llegó al refugio ${refuge.id}.`);
    }
  }
  if (survivor?.abordo) survivor.nodo = vehicle.nodo;
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

  // Despachar la ambulancia y avanzar el rescate por la red vial.
  advanceRescue(next);

  // Mover un sobreviviente un tramo por su ruta disponible.
  const survivor = next.sobrevivientes.find((item) => item.activo && !item.rescateEnCurso && !item.rescatado);

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
