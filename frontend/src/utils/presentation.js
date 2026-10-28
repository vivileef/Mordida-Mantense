const technicalId = /^[A-Z]+-\d+$/i;
const generatedIntersectionName = /^intersecci[oó]n\s+[A-Z]+-\d+$/i;

function configuredName(item) {
  const value = item?.nombre ?? item?.name;
  if (typeof value !== "string") return "";
  const name = value.trim();
  return name && !technicalId.test(name) && !generatedIntersectionName.test(name)
    ? name
    : "";
}

export function streetDisplayName(street) {
  const name = configuredName(street);
  return name && !/^calle sin nombre$/i.test(name) ? name : "Calle sin nombre";
}

export function intersectionDisplayName(node, streets = []) {
  const ownName = configuredName(node);
  if (ownName) return ownName;

  const names = [...new Set(
    streets
      .filter((street) =>
        String(street.origen) === String(node?.id) ||
        String(street.destino) === String(node?.id),
      )
      .map(streetDisplayName)
      .filter((name) => name !== "Calle sin nombre"),
  )];

  if (names.length > 1) return `Cruce de ${names.slice(0, 2).join(" y ")}`;
  if (names.length === 1) return `Intersección de ${names[0]}`;
  return "Intersección";
}

function entityLabels(items, fallback, typeLabel) {
  const counts = new Map();
  return new Map(items.map((item, index) => {
    const category = typeLabel ? typeLabel(item) : fallback;
    const count = (counts.get(category) ?? 0) + 1;
    counts.set(category, count);
    return [String(item.id), configuredName(item) || `${category} ${count}` || `${fallback} ${index + 1}`];
  }));
}

export function createDisplayNames(world = {}) {
  world ??= {};
  const zombies = world.zombies ?? [];
  const survivors = world.sobrevivientes ?? [];
  const shelters = world.refugios ?? [];

  return {
    survivors: entityLabels(survivors, "Sobreviviente"),
    shelters: new Map(shelters.map((shelter, index) => [
      String(shelter.id),
      configuredName(shelter) || `Refugio ${index + 1}`,
    ])),
    zombies: entityLabels(zombies, "Zombie", (zombie) => {
      const type = String(zombie.tipo ?? zombie.type ?? "").toLowerCase();
      if (["corredor", "runner"].includes(type)) return "Corredor";
      if (["horda", "horde"].includes(type)) return "Horda";
      if (["dormido", "dormant"].includes(type)) return "Dormido";
      return "Caminante";
    }),
  };
}

export function displayEntityName(names, kind, id, fallback) {
  return names[kind]?.get(String(id)) || fallback;
}

export function eventDisplayDescription(event, world = {}, names = createDisplayNames(world)) {
  let description = String(event?.descripcion ?? "Evento del simulador");
  const edge = event?.arista;
  const mentionedNodes = description.match(/\bN-\d+\b/gi) ?? [];
  const endpoints = Array.isArray(edge) && edge.length >= 2
    ? edge.map(String)
    : [...new Set(mentionedNodes)].slice(0, 2);

  if (endpoints.length === 2 && /calle|bloque|puente|avenida/i.test(`${event?.tipo ?? ""} ${description}`)) {
    const street = (world.calles ?? []).find((item) =>
      (String(item.origen) === endpoints[0] && String(item.destino) === endpoints[1]) ||
      (String(item.origen) === endpoints[1] && String(item.destino) === endpoints[0]),
    );
    if (street) return `${streetDisplayName(street)} bloqueada.`;
  }

  const nodes = new Map((world.nodos ?? []).map((node) => [String(node.id), node]));
  description = description.replace(/\bN-\d+\b/gi, (id) => {
    const node = nodes.get(id);
    return node ? intersectionDisplayName(node, world.calles ?? []) : "Intersección";
  });
  for (const [pattern, kind, fallback] of [
    [/\bS-\d+\b/gi, "survivors", "Sobreviviente"],
    [/\bR-\d+\b/gi, "shelters", "Refugio"],
    [/\b(?:Z|H)-\d+\b/gi, "zombies", "Zombie"],
  ]) {
    description = description.replace(pattern, (id) => displayEntityName(names, kind, id, fallback));
  }
  return description;
}
