from __future__ import annotations

from dataclasses import asdict
import logging
import os
import random
from pathlib import Path
from threading import RLock

from .graph import CityGraph
from .model import Refuge, RescueVehicle, Survivor, WorldState, Zombie, ZombieType
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
        refuge_nodes = [refuge.node for refuge in world.refuges.values()]
        world.rescue_vehicles = {
            f"V-{number:02d}": RescueVehicle(
                f"V-{number:02d}",
                refuge_nodes[(number - 1) % len(refuge_nodes)],
            )
            for number in range(1, 6)
        }
        return world

    def _refuge_occupancy(self, refuge_id: str) -> int:
        return sum(
            survivor.active and survivor.refuge_id == refuge_id
            for survivor in self.world.survivors.values()
        )

    def _available_refuges(self, survivor_id: str) -> set[str]:
        available = set()
        for refuge in self.world.refuges.values():
            occupancy = self._refuge_occupancy(refuge.id)
            assigned = self.world.survivors.get(survivor_id)
            if assigned and assigned.refuge_id == refuge.id:
                occupancy -= 1
            if occupancy < refuge.capacity:
                available.add(refuge.id)
        return available

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
            available_refuges = self._available_refuges(survivor_id)
            refuge_signature = tuple(sorted(
                (r.id, r.node, r.capacity, self._refuge_occupancy(r.id))
                for r in self.world.refuges.values()
            ))
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
            if refuge is not None and refuge.id not in available_refuges:
                refuge, routes = select_refuge_routes(
                    self.graph,
                    self.world,
                    start,
                    [item for item in self.world.refuges.values() if item.id in available_refuges],
                    preferred_refuge_id=None,
                    limit=limit,
                    horde_radius=self.horde_radius,
                    return_refuge=True,
                )
            if refuge is not None and refuge.id != survivor.refuge_id:
                survivor.refuge_id = refuge.id
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
                    }
                    for survivor in self.world.survivors.values()
                ],
                "refugios": [
                    {
                        **asdict(refuge),
                        "ocupados": self._refuge_occupancy(refuge.id),
                        "disponibles": max(0, refuge.capacity - self._refuge_occupancy(refuge.id)),
                        "lleno": self._refuge_occupancy(refuge.id) >= refuge.capacity,
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
                "prediccionesCorredores": self.runner_predictions(),
                "rescate": self.rescue_state(),
            }

    def runner_predictions(self, horizon: int = 3) -> list[dict]:
        """Predice el trayecto de cada corredor sin mutar el mundo."""
        with self._lock:
            predictions = []
            for zombie in self.world.zombies.values():
                if zombie.type != ZombieType.RUNNER or not zombie.visible:
                    continue
                current = zombie.node
                path = [current]
                for _ in range(max(1, min(horizon, 8))):
                    target = self._closest_survivor_node(current)
                    if target is None:
                        break
                    next_node = self._next_runner_node(current, target)
                    if next_node is None or next_node == current:
                        break
                    path.append(next_node)
                    current = next_node
                predictions.append({
                    "corredorId": zombie.id,
                    "nodoActual": zombie.node,
                    "nodosPredichos": path,
                    "objetivo": self._closest_survivor_node(zombie.node),
                    "turnos": len(path) - 1,
                })
            return predictions

    def _next_runner_node(self, origin: str, target: str) -> str | None:
        candidates = [
            edge.target for edge in self.graph.neighbors(origin)
            if not self.world.is_blocked(origin, edge.target)
        ]
        if not candidates:
            return None
        return min(candidates, key=lambda node: self._hop_distance(node, target))

    def _closest_survivor_node(self, origin: str) -> str | None:
        candidates = [
            survivor.node
            for survivor in self.world.survivors.values()
            if survivor.active and self._hop_distance(origin, survivor.node) <= 3
        ]
        return min(candidates, key=lambda node: self._hop_distance(origin, node), default=None)

    def _hop_distance(self, start: str, goal: str) -> int:
        if start == goal:
            return 0
        pending = [(start, 0)]
        visited = {start}
        while pending:
            node, distance = pending.pop(0)
            for edge in self.graph.neighbors(node):
                if self.world.is_blocked(node, edge.target) or edge.target in visited:
                    continue
                if edge.target == goal:
                    return distance + 1
                visited.add(edge.target)
                pending.append((edge.target, distance + 1))
        return 10**9

    def rescue_state(self) -> dict:
        vehicles = []
        for vehicle in self.world.rescue_vehicles.values():
            vehicles.append({
                **asdict(vehicle),
                "pasajeros": len(vehicle.passenger_ids),
                "disponibles": max(0, vehicle.capacity - len(vehicle.passenger_ids)),
            })
        assignments = [
            {
                "vehiculoId": vehicle.id,
                "sobrevivienteId": survivor_id,
                "orden": index + 1,
            }
            for vehicle in self.world.rescue_vehicles.values()
            for index, survivor_id in enumerate(vehicle.passenger_ids)
        ]
        return {
            "vehiculos": vehicles,
            "asignaciones": assignments,
            "capacidadTotal": sum(v.capacity for v in self.world.rescue_vehicles.values()),
        }

    def rescue_plan(self) -> dict:
        """Asigna primero a quienes están más expuestos y luego a los más cercanos."""
        with self._lock:
            candidates = [
                survivor for survivor in self.world.survivors.values()
                if survivor.active and not any(
                    survivor.id in vehicle.passenger_ids
                    for vehicle in self.world.rescue_vehicles.values()
                )
            ]
            runners = {prediction["objetivo"] for prediction in self.runner_predictions()}
            candidates.sort(key=lambda survivor: (
                0 if survivor.node in runners else 1,
                self._nearest_zombie_distance(survivor.node),
                survivor.id,
            ))
            assignments = []
            for vehicle in self.world.rescue_vehicles.values():
                for survivor in candidates:
                    if len(assignments) >= len(candidates):
                        break
                    if any(item["sobrevivienteId"] == survivor.id for item in assignments):
                        continue
                    assignments.append({
                        "vehiculoId": vehicle.id,
                        "sobrevivienteId": survivor.id,
                        "orden": len(assignments) + 1,
                        "prioridad": "corredor" if survivor.node in runners else "distancia",
                    })
                    if sum(item["vehiculoId"] == vehicle.id for item in assignments) == vehicle.capacity:
                        break
            return {"asignaciones": assignments, "vehiculos": self.rescue_state()["vehiculos"]}

    def dispatch_rescue(self) -> dict:
        with self._lock:
            plan = self.rescue_plan()
            for assignment in plan["asignaciones"]:
                vehicle = self.world.rescue_vehicles[assignment["vehiculoId"]]
                vehicle.passenger_ids.append(assignment["sobrevivienteId"])
                vehicle.status = "asignada"
                vehicle.target_node = self.world.survivors[assignment["sobrevivienteId"]].node
            return self.rescue_state() | {"asignaciones": plan["asignaciones"]}

    def _nearest_zombie_distance(self, node: str) -> int:
        visible = [zombie.node for zombie in self.world.zombies.values() if zombie.visible]
        return min((self._hop_distance(node, target) for target in visible), default=10**9)

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
