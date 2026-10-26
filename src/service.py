from __future__ import annotations

from dataclasses import asdict
from threading import RLock

from .graph import CityGraph
from .model import Refuge, Survivor, WorldState, Zombie, ZombieType
from .routing import shortest_safe_path
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
        self.simulator = ApocalypseSimulator(self.graph, self.world)
        self.turn_loop = TurnLoop(self.simulate_turn)
        self._lock = RLock()

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
            refuge = self.world.refuges[survivor.refuge_id]
            path = shortest_safe_path(self.graph, self.world, node, refuge.node)
            # La respuesta del contrato es solo el siguiente nodo, no la ruta completa.
            return path[1] if path and len(path) > 1 else node

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
                        "visible": zombie.visible,
                    }
                    for zombie in self.world.zombies.values()
                ],
                "sobrevivientes": [
                    {
                        "id": survivor.id,
                        "nodo": survivor.node,
                        "refugioId": survivor.refuge_id,
                        "activo": survivor.active,
                    }
                    for survivor in self.world.survivors.values()
                ],
                "refugios": [asdict(refuge) for refuge in self.world.refuges.values()],
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
            }

    def simulate_turn(self, blocked_edge: tuple[str, str] | None = None) -> int:
        """Avanza exactamente un turno, opcionalmente aplicando un cierre de calle."""
        with self._lock:
            if blocked_edge:
                self.simulator.block_edge(*blocked_edge)
            return self.simulator.advance_turn()

    def load_scenario(self, name: str) -> None:
        """Reinicia el mundo con una ronda reproducible sin detener el reloj."""
        with self._lock:
            world = build_scenario(name, self.graph)
            world._graph = self.graph
            self.world = world
            self.simulator = ApocalypseSimulator(self.graph, self.world)

    def start_turn_loop(self) -> None:
        """Activa el reloj de dos segundos usado por el servidor."""
        self.turn_loop.start()

    def stop_turn_loop(self) -> None:
        """Detiene el reloj para apagar el servidor sin dejar hilos vivos."""
        self.turn_loop.stop()
