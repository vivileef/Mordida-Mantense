import test from "node:test";
import assert from "node:assert/strict";
import {
  createDisplayNames,
  displayEntityName,
  eventDisplayDescription,
  intersectionDisplayName,
  streetDisplayName,
} from "../src/utils/presentation.js";

test("uses OSM street names and an honest unnamed-road fallback", () => {
  assert.equal(streetDisplayName({ nombre: "Avenida 4 de Noviembre" }), "Avenida 4 de Noviembre");
  assert.equal(streetDisplayName({ nombre: "calle sin nombre" }), "Calle sin nombre");
  assert.equal(streetDisplayName({}), "Calle sin nombre");
});

test("describes an intersection from named connected streets without IDs", () => {
  const node = { id: "N-001", nombre: "Intersección N-001" };
  const streets = [
    { origen: "N-001", destino: "N-002", nombre: "Avenida 4 de Noviembre" },
    { origen: "N-003", destino: "N-001", nombre: "Calle 12" },
  ];
  const label = intersectionDisplayName(node, streets);
  assert.equal(label, "Cruce de Avenida 4 de Noviembre y Calle 12");
  assert.doesNotMatch(label, /N-001/);
});

test("assigns friendly stable labels while keeping IDs as lookup keys", () => {
  const names = createDisplayNames({
    sobrevivientes: [{ id: "S-0089" }, { id: "S-0112", nombre: "Alicia" }],
    zombies: [{ id: "H-003", tipo: "horda" }, { id: "Z-1", tipo: "corredor" }],
    refugios: [{ id: "R-001" }],
  });
  assert.equal(displayEntityName(names, "survivors", "S-0089", "Sobreviviente"), "Sobreviviente 1");
  assert.equal(displayEntityName(names, "survivors", "S-0112", "Sobreviviente"), "Alicia");
  assert.equal(displayEntityName(names, "zombies", "H-003", "Zombie"), "Horda 1");
  assert.equal(displayEntityName(names, "zombies", "Z-1", "Zombie"), "Corredor 1");
  assert.equal(displayEntityName(names, "shelters", "R-001", "Refugio"), "Refugio 1");
});

test("presents event roads and entities without exposing internal IDs", () => {
  const world = {
    nodos: [{ id: "N-001" }, { id: "N-002" }],
    calles: [{ origen: "N-001", destino: "N-002", nombre: "Avenida 4 de Noviembre" }],
    sobrevivientes: [{ id: "S-0089" }],
    zombies: [{ id: "H-003", tipo: "horda" }],
    refugios: [{ id: "R-001" }],
  };
  const names = createDisplayNames(world);
  assert.equal(
    eventDisplayDescription({ tipo: "calle", descripcion: "Calle N-001 → N-002 bloqueada." }, world, names),
    "Avenida 4 de Noviembre bloqueada.",
  );
  assert.equal(
    eventDisplayDescription({ tipo: "horda", descripcion: "La horda H-003 cambió de dirección." }, world, names),
    "La horda Horda 1 cambió de dirección.",
  );
});

test("creates labels for the 200-agent target without ID-derived labels", () => {
  const world = {
    sobrevivientes: Array.from({ length: 200 }, (_, index) => ({ id: `S-${index + 1}` })),
    zombies: Array.from({ length: 44 }, (_, index) => ({ id: `Z-${index + 1}`, tipo: "caminante" })),
    refugios: [{ id: "R-001" }],
  };
  const names = createDisplayNames(world);
  assert.equal(names.survivors.size, 200);
  assert.equal(displayEntityName(names, "survivors", "S-200", "Sobreviviente"), "Sobreviviente 200");
  assert.equal(displayEntityName(names, "zombies", "Z-44", "Zombie"), "Caminante 44");
});
