const center = [-0.9536, -80.7089];

const nodes = Array.from({ length: 25 }, (_, index) => {
  const row = Math.floor(index / 5);
  const column = index % 5;
  return {
    id: `N-${String(index + 1).padStart(4, '0')}`,
    lat: center[0] + (row - 2) * 0.008,
    lng: center[1] + (column - 2) * 0.009,
  };
});

const streets = [];
for (let row = 0; row < 5; row += 1) {
  for (let column = 0; column < 5; column += 1) {
    const index = row * 5 + column;
    if (column < 4) streets.push({ origen: nodes[index].id, destino: nodes[index + 1].id, tipo: 'avenida' });
    if (row < 4) streets.push({ origen: nodes[index].id, destino: nodes[index + 5].id, tipo: 'calle' });
  }
}

const baseWorld = {
  turno: 1,
  zombies: [
    { id: 'Z-014', tipo: 'caminante', nodo: 'N-0007', visible: true },
    { id: 'Z-032', tipo: 'corredor', nodo: 'N-0019', visible: true },
    { id: 'H-003', tipo: 'horda', nodo: 'N-0009', visible: true, cantidad: 14 },
    { id: 'Z-021', tipo: 'dormido', nodo: 'N-0021', visible: true },
    { id: 'Z-055', tipo: 'caminante', nodo: 'N-0014', visible: true },
  ],
  sobrevivientes: [
    { id: 'S-0089', nodo: 'N-0013', refugioId: 'R-001', activo: true },
    { id: 'S-0112', nodo: 'N-0023', refugioId: 'R-002', activo: true },
    { id: 'S-0031', nodo: 'N-0008', refugioId: 'R-001', activo: true },
    { id: 'S-0204', nodo: 'N-0017', refugioId: 'R-002', activo: true },
  ],
  refugios: [
    { id: 'R-001', nodo: 'N-0001', capacidad: 100 },
    { id: 'R-002', nodo: 'N-0025', capacidad: 80 },
    { id: 'R-003', nodo: 'N-0005', capacidad: 60 },
    { id: 'R-004', nodo: 'N-0021', capacidad: 45 },
  ],
  aristasBloqueadas: [['N-0011', 'N-0012']],
  calles: streets,
  nodos: nodes,
  rutas: [
    { survivorId: 'S-0089', nodes: ['N-0013', 'N-0012', 'N-0007', 'N-0002', 'N-0001'], status: 'activa', updatedAt: 'hace 4 s' },
    { survivorId: 'S-0112', nodes: ['N-0023', 'N-0024', 'N-0025'], status: 'activa', updatedAt: 'hace 4 s' },
    { survivorId: 'S-0031', nodes: ['N-0008', 'N-0003', 'N-0002', 'N-0001'], status: 'invalida', updatedAt: 'hace 14 s' },
  ],
  eventos: [
    { turno: 1, tipo: 'sistema', descripcion: 'Demostración iniciada con datos simulados.' },
    { turno: 1, tipo: 'calle', descripcion: 'Calle N-0011 → N-0012 bloqueada.' },
    { turno: 0, tipo: 'refugio', descripcion: 'Refugio R-001 operativo al 72% de capacidad.' },
  ],
};

export function createDemoWorld() {
  return structuredClone(baseWorld);
}

export function advanceDemoWorld(world) {
  const next = structuredClone(world);
  next.turno += 1;
  const walker = next.zombies.find((zombie) => zombie.tipo === 'caminante');
  if (walker) {
    const current = next.nodos.findIndex((node) => node.id === walker.nodo);
    walker.nodo = next.nodos[(current + 1) % next.nodos.length].id;
  }
  const survivor = next.sobrevivientes.find((item) => item.activo);
  if (survivor) {
    const route = next.rutas.find((item) => item.survivorId === survivor.id && item.status === 'activa');
    if (route && route.nodes.length > 1) {
      route.nodes.shift();
      survivor.nodo = route.nodes[0];
    }
  }
  if (next.turno % 4 === 0) {
    next.eventos.unshift({ turno: next.turno, tipo: 'horda', descripcion: 'La horda H-003 cambió de dirección cerca de la avenida.' });
  }
  if (next.turno % 7 === 0) {
    const sleeper = next.zombies.find((zombie) => zombie.tipo === 'dormido');
    if (sleeper) {
      sleeper.tipo = 'corredor';
      next.eventos.unshift({ turno: next.turno, tipo: 'peligro', descripcion: `${sleeper.id} despertó: amenaza corredor detectada.` });
    }
  }
  next.eventos = next.eventos.slice(0, 12);
  return next;
}

export { center };
