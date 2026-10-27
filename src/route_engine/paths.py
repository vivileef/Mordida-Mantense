from __future__ import annotations

import heapq
from itertools import count

from .hazards import dangerous_edges, dangerous_nodes
from .types import GraphLike, WorldLike


def shortest_safe_path(
    graph: GraphLike,
    world: WorldLike,
    start: str,
    goal: str,
    *,
    horde_radius: int = 1,
    banned_edges: set[tuple[str, str]] | None = None,
    danger: set[str] | None = None,
    frontal_edges: set[tuple[str, str]] | None = None,
) -> list[str] | None:
    """Dijkstra por metros que filtra calles cerradas y riesgos observables."""
    if start not in graph.nodes or goal not in graph.nodes:
        return None
    danger = set(danger) if danger is not None else dangerous_nodes(graph, world, horde_radius)
    danger.discard(start)
    if goal in danger:
        return None
    frontal_edges = frontal_edges if frontal_edges is not None else dangerous_edges(world)
    banned_edges = banned_edges or set()
    sequence = count()
    queue: list[tuple[float, int, str]] = [(0.0, next(sequence), start)]
    costs = {start: 0.0}
    previous: dict[str, str] = {}
    while queue:
        cost_so_far, _, current = heapq.heappop(queue)
        if cost_so_far != costs.get(current):
            continue
        if current == goal:
            path = [current]
            while current in previous:
                current = previous[current]
                path.append(current)
            path.reverse()
            return path
        for edge in graph.neighbors(current):
            target = edge.target
            if (world.is_blocked(current, target)
                    or (current, target) in banned_edges
                    or (target, current) in frontal_edges
                    or target in danger):
                continue
            candidate = cost_so_far + edge.distance_m
            if candidate < costs.get(target, float("inf")):
                costs[target] = candidate
                previous[target] = current
                heapq.heappush(queue, (candidate, next(sequence), target))
    return None


def alternative_safe_paths(
    graph: GraphLike,
    world: WorldLike,
    start: str,
    goal: str,
    *,
    count_paths: int = 3,
    horde_radius: int = 1,
) -> list[list[str]]:
    """Busca rutas distintas prohibiendo sucesivamente el primer tramo anterior."""
    danger = dangerous_nodes(graph, world, horde_radius)
    frontal = dangerous_edges(world)
    paths: list[list[str]] = []
    banned: set[tuple[str, str]] = set()
    for _ in range(max(1, count_paths)):
        path = shortest_safe_path(
            graph, world, start, goal, horde_radius=horde_radius,
            banned_edges=banned, danger=danger, frontal_edges=frontal,
        )
        if path is None:
            break
        paths.append(path)
        if len(path) > 1:
            banned.add((path[0], path[1]))
    return paths


def select_refuge_routes(
    graph: GraphLike,
    world: WorldLike,
    start: str,
    refuges,
    *,
    preferred_refuge_id: str | None = None,
    limit: int = 3,
    horde_radius: int = 1,
) -> list[list[str]]:
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
        distance = sum(
            next(edge.distance_m for edge in graph.neighbors(a) if edge.target == b)
            for a, b in zip(path, path[1:])
        )
        # El preferido solo resuelve empates; el criterio principal es distancia.
        candidates.append((distance, "" if refuge.id == preferred_refuge_id else refuge.id, refuge, path))
    if not candidates:
        return []
    candidates.sort(key=lambda item: (item[0], item[1]))
    chosen = candidates[0]
    if limit <= 1:
        return [chosen[3]]
    alternatives = alternative_safe_paths(
        graph, world, start, chosen[2].node,
        count_paths=max(1, limit), horde_radius=horde_radius,
    )
    return alternatives[:max(1, limit)] or [chosen[3]]
