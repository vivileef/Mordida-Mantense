from __future__ import annotations

from dataclasses import asdict
import os
import random
from threading import RLock

from .graph import CityGraph
from .model import Refuge, Survivor, WorldState, Zombie, ZombieType
from .route_engine.cache import RouteCache
from .route_engine.hazards import danger_signature
from .route_engine.paths import select_refuge_routes
from .scenarios import build_scenario
from .simulator import ApocalypseSimulator
from .turn_loop import TurnLoop


class RouteService:
    """Fachada del motor: coordina el grafo, el estado y el planificador."""

    def __init__(self, graph: CityGraph | None = None, scenario: str | None = None) -> None:
        # El grafo se inyecta para poder probar mapas alternativos sin cambiar el servicio.
        self.graph = graph or CityGraph.demo()
        self.world = (
            build_scenario(scenario, self.graph)
            if scenario
            else self._initial_world()
        )
        self.world._graph = self.graph
        self.simulator = self._new_simulator()
        self.turn_loop = TurnLoop(self.simulate_turn)
        self._lock = RLock()
        self._route_cache = RouteCache()
        self.horde_radius = max(0, int(os.environ.get("MANTA_HORDE_RADIUS", "1")))

    def _initial_world(self) -> WorldState:
        """Crea un escenario pequeño reproducible para la primera versión."""
        world = WorldState()
        world.refuges = {
            "R-001": Refuge("R-001", "N-0001"),
            "R-002": Refuge("R-002", "N-0025"),
        }
        world.survivors = {
            "S-0001": Survivor("S-0001", "N-0013", "R-001"),
            "S-0002": Survivor("S-0002", "N-0023", "R-002"),
        }
        world.zombies = {
            "Z-0001": Zombie("Z-0001", ZombieType.WALKER, "N-0007"),
            "Z-0002": Zombie("Z-0002", ZombieType.RUNNER, "N-0019"),
            "Z-0003": Zombie("Z-0003", ZombieType.HORDE, "N-0009"),
        }
        return world

    def next_step(self, survivor_id: str, node: str, turn: int) -> str:
        """Devuelve un único movimiento válido para el turno solicitado."""
        with self._lock:
            survivor = self.world.survivors.get(survivor_id)
            # Un sobreviviente desconocido o eliminado debe quedarse quieto.
            if survivor is None or not survivor.active:
                return node
            if node not in self.graph.nodes:
                return node
            paths = self.routes_for(survivor_id, node, limit=1)
            # La respuesta del contrato es solo el siguiente nodo, no la ruta completa.
            return paths[0][1] if paths and len(paths[0]) > 1 else node

    def routes_for(self, survivor_id: str, node: str | None = None, limit: int = 3) -> list[list[str]]:
        """Devuelve las mejores rutas seguras hacia el refugio asignado o uno alcanzable."""
        with self._lock:
            survivor = self.world.survivors.get(survivor_id)
            if survivor is None or not survivor.active:
                return []
            start = node or survivor.node
            if start not in self.graph.nodes:
                return []
            refuge_signature = tuple(sorted((r.id, r.node) for r in self.world.refuges.values()))
            key = (survivor.refuge_id, refuge_signature, start, limit,
                   self.horde_radius, danger_signature(self.world))
            cached = self._route_cache.get(key)
            if cached is not None:
                return cached
            result = select_refuge_routes(
                self.graph, self.world, start, self.world.refuges.values(),
                preferred_refuge_id=survivor.refuge_id, limit=limit,
                horde_radius=self.horde_radius,
            )
            return self._route_cache.put(key, result)

    def route_details(self, survivor_id: str) -> dict | None:
        with self._lock:
            survivor = self.world.survivors.get(survivor_id)
            paths = self.routes_for(survivor_id)
            if survivor is None or not paths:
                return None
            primary = paths[0]
            refuge = next((r for r in self.world.refuges.values() if r.node == primary[-1]), None)
            streets = []
            for a, b in zip(primary, primary[1:]):
                edge = min(
                    (e for e in self.graph.neighbors(a) if e.target == b),
                    key=lambda item: item.distance_m,
                )
                streets.append({"origen": a, "destino": b, "nombre": edge.name, "distancia_m": edge.distance_m, "tipo": edge.street_type})
            return {"sobrevivienteId": survivor_id, "refugioId": refuge.id if refuge else None,
                    "nodos": primary, "calles": streets,
                    "distancia_m": sum(s["distancia_m"] for s in streets),
                    "alternativas": paths[1:]}

    def _new_simulator(self) -> ApocalypseSimulator:
        seed_value = os.environ.get("MANTA_RANDOM_SEED")
        random_source = random.Random(int(seed_value)) if seed_value else None
        return ApocalypseSimulator(self.graph, self.world, random_source)

    def state(self) -> dict:
        """Serializa el estado interno al formato público del simulador."""
        with self._lock:
            return {
                "turno": self.world.turn,
                "zombies": [
                    {
                        "id": zombie.id,
                        "tipo": zombie.type.value,
                        "nodo": zombie.node,
                        "nombreNodo": self.graph.node_name(zombie.node),
                        "visible": zombie.visible,
                    }
                    for zombie in self.world.zombies.values()
                ],
                "sobrevivientes": [
                    {
                        "id": survivor.id,
                        "nodo": survivor.node,
                        "nombreNodo": self.graph.node_name(survivor.node),
                        "nodoAnterior": survivor.previous_node,
                        "refugioId": survivor.refuge_id,
                        "activo": survivor.active,
                    }
                    for survivor in self.world.survivors.values()
                ],
                "refugios": [
                    {
                        **asdict(refuge),
                        "nombreNodo": self.graph.node_name(refuge.node),
                    }
                    for refuge in self.world.refuges.values()
                ],
                "aristasBloqueadas": [list(edge) for edge in self.world.blocked_edges],
                "eventos": [
                    {
                        "turno": event.turn,
                        "tipo": event.event_type,
                        "arista": list(event.edge),
                        "descripcion": event.description,
                    }
                    for event in self.world.events
                ],
                "eventosProgramados": [
                    {
                        "turno": event.turn,
                        "tipo": event.event_type,
                        "arista": list(event.edge),
                        "descripcion": event.description,
                    }
                    for event in self.world.scheduled_events
                    if event not in self.world.events
                ],
                "nodos": self.graph.as_dict()["nodos"],
                "rutas": self.planned_routes(),
            }

    def planned_routes(self) -> list[dict]:
        """Publica la ruta completa vigente de cada sobreviviente activo."""
        routes = []
        for survivor in self.world.survivors.values():
            if not survivor.active:
                continue
            refuge = self.world.refuges[survivor.refuge_id]
            paths = self.routes_for(survivor.id, survivor.node, limit=1)
            if not paths:
                continue
            path = paths[0]
            routes.append(
                {
                    "sobrevivienteId": survivor.id,
                        "refugioId": refuge.id if path[-1] == refuge.node else next((r.id for r in self.world.refuges.values() if r.node == path[-1]), None),
                    "nodos": path,
                    "nombresNodos": [self.graph.node_name(node) for node in path],
                    "distanciaNodos": len(path) - 1,
                    "calles": [
                        {
                            "origen": path[index],
                            "destino": path[index + 1],
                            "nombre": next(
                                edge.name
                                for edge in self.graph.neighbors(path[index])
                                if edge.target == path[index + 1]
                            ),
                        }
                        for index in range(len(path) - 1)
                    ],
                }
            )
        return routes

    def simulate_turn(self, blocked_edge: tuple[str, str] | None = None) -> int:
        """Avanza exactamente un turno, opcionalmente aplicando un cierre de calle."""
        with self._lock:
            if blocked_edge:
                self.simulator.block_edge(*blocked_edge)
            return self.simulator.advance_turn()

    def move_survivor(self, survivor_id: str, target: str) -> bool:
        """Registra el movimiento ejecutado por el simulador de sobrevivientes."""
        with self._lock:
            return self.simulator.move_survivor(survivor_id, target)

    def load_scenario(self, name: str) -> None:
        """Reinicia el mundo con una ronda reproducible sin detener el reloj."""
        with self._lock:
            world = build_scenario(name, self.graph)
            world._graph = self.graph
            self.world = world
            self.simulator = self._new_simulator()
            self._route_cache.clear()

    def start_turn_loop(self) -> None:
        """Activa el reloj de dos segundos usado por el servidor."""
        self.turn_loop.start()

    def stop_turn_loop(self) -> None:
        """Detiene el reloj para apagar el servidor sin dejar hilos vivos."""
        self.turn_loop.stop()
