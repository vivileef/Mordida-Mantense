from __future__ import annotations

from dataclasses import asdict
import logging
import os
import random
import heapq
from pathlib import Path
from threading import RLock

from .graph import CityGraph
from .model import Refuge, Survivor, WorldState, Zombie, ZombieType
from .route_engine.cache import RouteCache
from .route_engine.hazards import danger_signature
from .route_engine.paths import select_refuge_routes
from .scenarios import build_scenario
from .simulator import ApocalypseSimulator
from .turn_loop import TurnLoop


logger = logging.getLogger(__name__)


class RouteService:
    """Fachada del motor: coordina el grafo, el estado y el planificador."""

    def __init__(self, graph: CityGraph | None = None, scenario: str | None = None) -> None:
        # El grafo se inyecta para poder probar mapas alternativos sin cambiar el servicio.
        # Los escenarios de estrés históricos conservan su grafo pequeño para
        # que sus tiempos y contratos de prueba sean reproducibles. El servicio
        # normal y los escenarios cargados por la API usan el snapshot OSM.
        self.graph = graph or (CityGraph.demo() if scenario else self._load_default_graph())
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
        self._init_rescue_fleet()

    def _init_rescue_fleet(self) -> None:
        start = next(iter(self.world.refuges.values()), None)
        node = start.node if start else next(iter(self.graph.nodes), "")
        self.vehicles = {"V-001": {"id": "V-001", "nombre": "Ambulancia 1", "nodo": node,
            "estado": "disponible", "fase": "disponible", "ruta": [], "sobrevivienteId": None,
            "refugioId": None}}

    def _shortest_path(self, start: str, goal: str) -> list[str]:
        pending = [(0.0, start, [])]
        distances = {start: 0.0}
        while pending:
            distance, node, path = heapq.heappop(pending)
            if node == goal:
                return [*path, node]
            if distance != distances.get(node):
                continue
            for edge in self.graph.neighbors(node):
                if self.world.is_blocked(node, edge.target):
                    continue
                candidate = distance + edge.distance_m
                if candidate < distances.get(edge.target, float("inf")):
                    distances[edge.target] = candidate
                    heapq.heappush(pending, (candidate, edge.target, [*path, node]))
        return []

    def dispatch_vehicle(self, vehicle_id: str, survivor_id: str) -> bool:
        with self._lock:
            vehicle = self.vehicles.get(vehicle_id)
            survivor = self.world.survivors.get(survivor_id)
            if not vehicle or vehicle["fase"] != "disponible" or not survivor or not survivor.active or survivor.aboard:
                return False
            if survivor.refuge_id not in self.world.refuges:
                return False
            path = self._shortest_path(vehicle["nodo"], survivor.node)
            if not path:
                return False
            vehicle.update(estado="en camino", fase="recogida", ruta=path[1:], sobrevivienteId=survivor_id,
                refugioId=survivor.refuge_id)
            if not vehicle["ruta"]:
                self._load_vehicle(vehicle)
            return True

    def _load_vehicle(self, vehicle: dict) -> None:
        survivor = self.world.survivors.get(vehicle["sobrevivienteId"])
        if not survivor:
            return
        survivor.aboard = True
        vehicle["fase"] = "traslado"
        vehicle["estado"] = "trasladando sobreviviente"
        refuge = self.world.refuges[vehicle["refugioId"]]
        path = self._shortest_path(vehicle["nodo"], refuge.node)
        vehicle["ruta"] = path[1:] if path else []
        if not vehicle["ruta"]:
            self._finish_vehicle(vehicle)

    def _finish_vehicle(self, vehicle: dict) -> None:
        survivor = self.world.survivors.get(vehicle["sobrevivienteId"])
        if survivor:
            survivor.node = vehicle["nodo"]
            survivor.aboard = False
            survivor.active = False
            survivor.rescued = True
        vehicle.update(estado="disponible", fase="disponible", ruta=[], sobrevivienteId=None, refugioId=None)

    def _advance_rescue_fleet(self) -> None:
        for vehicle in self.vehicles.values():
            if vehicle["fase"] == "disponible":
                continue
            survivor = self.world.survivors.get(vehicle["sobrevivienteId"])
            if vehicle["fase"] == "recogida" and survivor:
                destination = vehicle["ruta"][-1] if vehicle["ruta"] else vehicle["nodo"]
                if destination != survivor.node:
                    path = self._shortest_path(vehicle["nodo"], survivor.node)
                    if not path:
                        vehicle.update(estado="disponible", fase="disponible", ruta=[], sobrevivienteId=None, refugioId=None)
                        continue
                    vehicle["ruta"] = path[1:]
            if vehicle["ruta"]:
                vehicle["nodo"] = vehicle["ruta"].pop(0)
            if vehicle["fase"] == "recogida" and survivor:
                if vehicle["nodo"] == survivor.node:
                    self._load_vehicle(vehicle)
            elif vehicle["fase"] == "traslado" and survivor:
                survivor.node = vehicle["nodo"]
                if not vehicle["ruta"]:
                    self._finish_vehicle(vehicle)

    @staticmethod
    def _load_default_graph() -> CityGraph:
        configured_path = os.environ.get("MANTA_GRAPH_PATH")
        candidates = [
            Path(configured_path) if configured_path else None,
            Path(__file__).resolve().parent.parent / "tools" / "grafo-manta" / "manta.json",
        ]
        for path in candidates:
            if path and path.is_file():
                import json

                return CityGraph.from_dict(json.loads(path.read_text(encoding="utf-8")))
        return CityGraph.demo()

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

    def _routes_and_refuge_for(
        self, survivor_id: str, node: str | None = None, limit: int = 3
    ) -> tuple[Refuge | None, list[list[str]]]:
        """Devuelve las rutas y conserva la identidad del refugio que las origina."""
        with self._lock:
            survivor = self.world.survivors.get(survivor_id)
            if survivor is None or not survivor.active:
                return None, []
            start = node or survivor.node
            if start not in self.graph.nodes:
                return None, []
            refuge_signature = tuple(sorted((r.id, r.node) for r in self.world.refuges.values()))
            key = (survivor.refuge_id, refuge_signature, start, limit,
                   self.horde_radius, danger_signature(self.world))
            cached = self._route_cache.get(key)
            if cached is not None:
                refuge, routes = cached
                return refuge, [path.copy() for path in routes]
            refuge, routes = select_refuge_routes(
                self.graph, self.world, start, self.world.refuges.values(),
                preferred_refuge_id=survivor.refuge_id, limit=limit,
                horde_radius=self.horde_radius, return_refuge=True,
            )
            self._route_cache.put(key, (refuge, routes))
            return refuge, [path.copy() for path in routes]

    def routes_for(self, survivor_id: str, node: str | None = None, limit: int = 3) -> list[list[str]]:
        """Devuelve las mejores rutas seguras hacia el refugio asignado o uno alcanzable."""
        return self._routes_and_refuge_for(survivor_id, node, limit)[1]

    def route_details(self, survivor_id: str) -> dict | None:
        with self._lock:
            survivor = self.world.survivors.get(survivor_id)
            refuge, paths = self._routes_and_refuge_for(survivor_id)
            if survivor is None or not paths:
                return None
            primary = paths[0]
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
                        "abordo": survivor.aboard,
                        "rescatado": survivor.rescued,
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
                "rescate": {"vehiculos": [dict(vehicle) for vehicle in self.vehicles.values()],
                    "asignaciones": [{"vehiculoId": vehicle["id"], "sobrevivienteId": vehicle["sobrevivienteId"]}
                        for vehicle in self.vehicles.values() if vehicle["sobrevivienteId"]]},
            }

    def planned_routes(self) -> list[dict]:
        """Publica la ruta completa vigente de cada sobreviviente activo."""
        routes = []
        for survivor in self.world.survivors.values():
            if not survivor.active:
                continue
            refuge, paths = self._routes_and_refuge_for(survivor.id, survivor.node, limit=1)
            if not paths:
                logger.warning(
                    "Ruta omitida: sobreviviente=%s nodo=%s turno=%s motivo=%s refugios=%s",
                    survivor.id,
                    survivor.node,
                    self.world.turn,
                    self._route_omission_reason(survivor.node),
                    sorted(refuge.id for refuge in self.world.refuges.values()),
                )
                continue
            path = paths[0]
            planned_streets = []
            for source, target in zip(path, path[1:]):
                edge = min(
                    (edge for edge in self.graph.neighbors(source) if edge.target == target),
                    key=lambda item: item.distance_m,
                )
                planned_streets.append({
                    "origen": source,
                    "destino": target,
                    "nombre": edge.name,
                })
            routes.append(
                {
                    "sobrevivienteId": survivor.id,
                    "refugioId": refuge.id if refuge else None,
                    "nodos": path,
                    "nombresNodos": [self.graph.node_name(node) for node in path],
                    "distanciaNodos": len(path) - 1,
                    "calles": planned_streets,
                }
            )
        return routes

    def _route_omission_reason(self, start: str) -> str:
        """Diagnose an omitted route without relaxing the planner's safety rules."""
        if start not in self.graph.nodes:
            return "nodo_del_sobreviviente_ausente_del_grafo"
        refuge_nodes = {refuge.node for refuge in self.world.refuges.values()}
        if not refuge_nodes:
            return "sin_refugios_configurados"

        def reachable(ignore_closures: bool) -> set[str]:
            visited = {start}
            pending = [start]
            while pending:
                current = pending.pop()
                for edge in self.graph.neighbors(current):
                    if not ignore_closures and self.world.is_blocked(current, edge.target):
                        continue
                    if edge.target not in visited:
                        visited.add(edge.target)
                        pending.append(edge.target)
            return visited

        if refuge_nodes & reachable(ignore_closures=False):
            return "rutas_descartadas_por_peligros_observables"
        if refuge_nodes & reachable(ignore_closures=True):
            return "cierres_desconectan_todos_los_refugios"
        return "refugios_desconectados_en_el_grafo"

    def simulate_turn(self, blocked_edge: tuple[str, str] | None = None) -> int:
        """Avanza exactamente un turno, opcionalmente aplicando un cierre de calle."""
        with self._lock:
            if blocked_edge:
                self.simulator.block_edge(*blocked_edge)
            turn = self.simulator.advance_turn()
            self._advance_rescue_fleet()
            return turn

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
            self._init_rescue_fleet()

    def start_turn_loop(self) -> None:
        """Activa el reloj de dos segundos usado por el servidor."""
        self.turn_loop.start()

    def stop_turn_loop(self) -> None:
        """Detiene el reloj para apagar el servidor sin dejar hilos vivos."""
        self.turn_loop.stop()
