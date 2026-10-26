from __future__ import annotations

import heapq
from itertools import count

from .graph import CityGraph
from .model import WorldState, ZombieType


def dangerous_nodes(world: WorldState) -> set[str]:
    """Obtiene nodos peligrosos según la posición visible de cada zombie."""
    blocked = {zombie.node for zombie in world.zombies.values() if zombie.visible}
    for zombie in world.zombies.values():
        if zombie.visible and zombie.type == ZombieType.HORDE:
            blocked.update(edge.target for edge in world_graph_neighbors(world, zombie.node))
    return blocked


def world_graph_neighbors(world: WorldState, node: str):
    # Este helper conserva la función preparada para el estado compartido.
    graph = getattr(world, "_graph", None)
    return graph.neighbors(node) if graph else []


def shortest_safe_path(
    graph: CityGraph,
    world: WorldState,
    start: str,
    goal: str,
) -> list[str] | None:
    """Calcula una ruta segura; devuelve None si no existe una ruta válida."""
    if start not in graph.nodes or goal not in graph.nodes:
        return None
    # Un zombie visible ocupa su nodo; una horda también amenaza sus vecinos.
    danger = {zombie.node for zombie in world.zombies.values() if zombie.visible}
    for zombie in world.zombies.values():
        if zombie.visible and zombie.type == ZombieType.HORDE:
            danger.update(edge.target for edge in graph.neighbors(zombie.node))
    danger.discard(start)
    if goal in danger:
        return None

    sequence = count()
    # El contador evita comparar nombres de nodos cuando dos prioridades empatan.
    queue: list[tuple[float, int, str]] = [(0, next(sequence), start)]
    costs = {start: 0.0}
    previous: dict[str, str] = {}
    while queue:
        _, _, current = heapq.heappop(queue)
        if current == goal:
            path = [current]
            while current in previous:
                current = previous[current]
                path.append(current)
            return list(reversed(path))
        for edge in graph.neighbors(current):
            # Una calle bloqueada nunca puede formar parte de la ruta.
            if world.is_blocked(current, edge.target):
                continue
            if edge.target in danger and edge.target != goal:
                continue
            cost = costs[current] + edge.distance_m
            if cost < costs.get(edge.target, float("inf")):
                costs[edge.target] = cost
                previous[edge.target] = current
                priority = cost + graph.heuristic(edge.target, goal)
                heapq.heappush(queue, (priority, next(sequence), edge.target))
    return None
