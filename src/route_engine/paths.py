from __future__ import annotations

import heapq
from itertools import count
from math import inf, isfinite

from ..graph import CityGraph
from .hazards import dangerous_edges, dangerous_nodes
from .types import GraphLike, WorldLike


def _edge_distance(graph: GraphLike, source: str, target: str) -> float:
    """Costo efectivo del tramo: Dijkstra puede escoger cualquier arista paralela."""
    return min(edge.distance_m for edge in graph.neighbors(source) if edge.target == target)


def _path_cost(graph: GraphLike, path: list[str] | tuple[str, ...]) -> float:
    return sum(_edge_distance(graph, source, target) for source, target in zip(path, path[1:]))


def _admissible_heuristic_scale(graph: GraphLike) -> float:
    """Calibra la heurística euclidiana de CityGraph para no superar ningún camino.

    CityGraph.heuristic() es una métrica euclidiana escalada en coordenadas,
    pero sus unidades no son metros. El menor cociente distancia/arista entre
    todos los tramos hace que la heurística escalada sea consistente y admisible.
    Otros grafos, o grafos con aristas que no permitan justificar la cota, usan h=0.
    """
    if not isinstance(graph, CityGraph) or type(graph).heuristic is not CityGraph.heuristic:
        return 0.0

    scale = inf
    for source in graph.nodes:
        for edge in graph.neighbors(source):
            if edge.target not in graph.nodes:
                return 0.0
            try:
                geometric_cost = graph.heuristic(source, edge.target)
            except (KeyError, TypeError, ValueError, OverflowError):
                return 0.0
            if not isfinite(geometric_cost) or geometric_cost < 0:
                return 0.0
            if geometric_cost == 0:
                continue
            if not isfinite(edge.distance_m) or edge.distance_m < 0:
                return 0.0
            scale = min(scale, edge.distance_m / geometric_cost)

    return scale if isfinite(scale) else 0.0


def _would_create_predecessor_cycle(previous: dict[str, str], node: str, parent: str) -> bool:
    """Evita ciclos al resolver empates de costo, incluidos los de peso cero."""
    current = parent
    while True:
        if current == node:
            return True
        if current not in previous:
            return False
        current = previous[current]


def shortest_safe_path(
    graph: GraphLike,
    world: WorldLike,
    start: str,
    goal: str,
    *,
    horde_radius: int = 1,
    banned_edges: set[tuple[str, str]] | None = None,
    banned_nodes: set[str] | None = None,
    danger: set[str] | None = None,
    frontal_edges: set[tuple[str, str]] | None = None,
) -> list[str] | None:
    """A* por metros que filtra calles cerradas y riesgos observables."""
    if start not in graph.nodes or goal not in graph.nodes:
        return None
    danger = set(danger) if danger is not None else dangerous_nodes(graph, world, horde_radius)
    danger.discard(start)
    banned_nodes = banned_nodes or set()
    if start in banned_nodes or goal in banned_nodes:
        return None
    if goal in danger:
        return None
    frontal_edges = frontal_edges if frontal_edges is not None else dangerous_edges(world)
    banned_edges = banned_edges or set()
    heuristic_scale = _admissible_heuristic_scale(graph)

    def estimate(node: str) -> float:
        if heuristic_scale == 0:
            return 0.0
        try:
            value = graph.heuristic(node, goal)  # type: ignore[attr-defined]
        except (AttributeError, KeyError, TypeError, ValueError, OverflowError):
            return 0.0
        if not isfinite(value) or value < 0:
            return 0.0
        return heuristic_scale * value

    sequence = count()
    queue: list[tuple[float, float, int, str]] = [
        (estimate(start), 0.0, next(sequence), start)
    ]
    costs = {start: 0.0}
    previous: dict[str, str] = {}
    node_order = {node: index for index, node in enumerate(graph.nodes)}
    best_goal_cost: float | None = None
    while queue:
        priority, cost_so_far, _, current = heapq.heappop(queue)
        if best_goal_cost is not None and priority > best_goal_cost:
            break
        if cost_so_far != costs.get(current):
            continue
        if current == goal:
            best_goal_cost = cost_so_far
            continue
        for edge in graph.neighbors(current):
            target = edge.target
            if not isfinite(edge.distance_m) or edge.distance_m < 0:
                raise ValueError(
                    f"distancia_m inválida en {current}->{target}: "
                    "Dijkstra requiere pesos finitos y no negativos (también requeridos por A*)"
                )
            if (world.is_blocked(current, target)
                    or (current, target) in banned_edges
                    or (target, current) in frontal_edges
                    or target in banned_nodes
                    or target in danger):
                continue
            candidate = cost_so_far + edge.distance_m
            best_known = costs.get(target, float("inf"))
            if candidate < best_known:
                costs[target] = candidate
                previous[target] = current
                heapq.heappush(
                    queue,
                    (candidate + estimate(target), candidate, next(sequence), target),
                )
            elif (candidate == best_known and target != start and target in previous
                  and node_order.get(current, float("inf")) < node_order.get(previous[target], float("inf"))
                  and not _would_create_predecessor_cycle(previous, target, current)):
                # Conserva un desempate estable cuando varias rutas tienen el
                # mismo costo, sin permitir ciclos por aristas de costo cero.
                previous[target] = current
    if goal not in costs:
        return None
    path = [goal]
    while path[-1] in previous:
        path.append(previous[path[-1]])
    path.reverse()
    return path


def alternative_safe_paths(
    graph: GraphLike,
    world: WorldLike,
    start: str,
    goal: str,
    *,
    count_paths: int = 3,
    horde_radius: int = 1,
) -> list[list[str]]:
    """Devuelve hasta k rutas seguras distintas usando la estrategia de Yen.

    Si origen y destino coinciden, la única ruta es `[origen]`; no existen
    alternativas distintas que devolver.
    """
    if count_paths <= 0 or start not in graph.nodes or goal not in graph.nodes:
        return []
    danger = dangerous_nodes(graph, world, horde_radius)
    frontal = dangerous_edges(world)
    first = shortest_safe_path(
        graph, world, start, goal, horde_radius=horde_radius,
        danger=danger, frontal_edges=frontal,
    )
    if first is None:
        return []
    if start == goal:
        return [[start]]

    accepted = [first]
    accepted_keys = {tuple(first)}
    candidates: list[tuple[float, int, tuple[str, ...]]] = []
    candidate_keys: set[tuple[str, ...]] = set()
    sequence = count()

    while len(accepted) < count_paths:
        previous = accepted[-1]
        for spur_index in range(len(previous) - 1):
            root = previous[:spur_index + 1]
            root_key = tuple(root)
            banned_edges = {
                (path[spur_index], path[spur_index + 1])
                for path in accepted
                if len(path) > spur_index + 1 and tuple(path[:spur_index + 1]) == root_key
            }
            banned_nodes = set(root[:-1])
            spur = shortest_safe_path(
                graph, world, root[-1], goal, horde_radius=horde_radius,
                banned_edges=banned_edges, banned_nodes=banned_nodes,
                danger=danger, frontal_edges=frontal,
            )
            if spur is None:
                continue
            combined = tuple(root[:-1] + spur)
            if combined in accepted_keys or combined in candidate_keys:
                continue
            # Yen's root is already safe; the spur search validates the rest.
            # This guard prevents a repeated node if a zero-cost graph is supplied.
            if len(set(combined)) != len(combined):
                continue
            candidate_keys.add(combined)
            heapq.heappush(candidates, (_path_cost(graph, combined), next(sequence), combined))
        if not candidates:
            break
        _, _, chosen = heapq.heappop(candidates)
        candidate_keys.remove(chosen)
        accepted.append(list(chosen))
        accepted_keys.add(chosen)
    return accepted


def select_refuge_routes(
    graph: GraphLike,
    world: WorldLike,
    start: str,
    refuges,
    *,
    preferred_refuge_id: str | None = None,
    limit: int = 3,
    horde_radius: int = 1,
    return_refuge: bool = False,
) -> list[list[str]] | tuple[object | None, list[list[str]]]:
    """Elige el refugio seguro de menor distancia y genera rutas alternativas."""
    danger = dangerous_nodes(graph, world, horde_radius)
    frontal = dangerous_edges(world)
    candidates: list[tuple[float, str, object, list[str]]] = []
    for refuge in refuges:
        if refuge.node not in graph.nodes:
            continue
        path = shortest_safe_path(
            graph, world, start, refuge.node, horde_radius=horde_radius,
            danger=danger, frontal_edges=frontal,
        )
        if path is None:
            continue
        distance = _path_cost(graph, path)
        # El preferido solo resuelve empates; el criterio principal es distancia.
        candidates.append((distance, "" if refuge.id == preferred_refuge_id else refuge.id, refuge, path))
    if not candidates:
        return (None, []) if return_refuge else []
    candidates.sort(key=lambda item: (item[0], item[1]))
    chosen = candidates[0]
    if limit <= 1:
        routes = [chosen[3]]
    else:
        alternatives = alternative_safe_paths(
            graph, world, start, chosen[2].node,
            count_paths=max(1, limit), horde_radius=horde_radius,
        )
        routes = alternatives[:max(1, limit)] or [chosen[3]]
    return (chosen[2], routes) if return_refuge else routes
