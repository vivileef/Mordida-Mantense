import { advanceDemoWorld, createDemoWorld } from '../data/demoWorld';

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
  };
}
