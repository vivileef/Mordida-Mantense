import { advanceDemoWorld, createDemoWorld } from '../data/demoWorld.js';
import { setWorldEdgeBlocked } from './roadRouting.js';

export function createDemoService() {
  let world = createDemoWorld();
  return {
    getState() {
      return Promise.resolve(structuredClone(world));
    },
    advance() {
      world = advanceDemoWorld(world);
      return Promise.resolve(structuredClone(world));
    },
    reset() {
      world = createDemoWorld();
      return Promise.resolve(structuredClone(world));
    },
    setBlockedEdge(origin, destination, blocked) {
      const result = setWorldEdgeBlocked(world, origin, destination, blocked);
      if (!result.ok || !result.changed) {
        return { ...result, world: structuredClone(world) };
      }
      world = result.world;
      const street = world.calles.find((item) =>
        String(item.origen) === String(origin) &&
        String(item.destino) === String(destination),
      );
      world.eventos.unshift({
        turno: world.turno,
        tipo: blocked ? 'calle' : 'sistema',
        descripcion: `Calle ${street?.nombre || 'sin nombre'}: sentido ${origin} -> ${destination} ${blocked ? 'bloqueado' : 'desbloqueado'}; rutas recalculadas.`,
      });
      world.eventos = world.eventos.slice(0, 12);
      return { ...result, world: structuredClone(world) };
    },
  };
}
