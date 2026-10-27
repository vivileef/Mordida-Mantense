from __future__ import annotations

from .types import GraphLike, WorldLike


def dangerous_nodes(graph: GraphLike, world: WorldLike, horde_radius: int = 1) -> set[str]:
    """Zombies visibles y el radio configurable de cada horda."""
    danger = {z.node for z in world.zombies.values() if z.visible}
    for zombie in world.zombies.values():
        if not zombie.visible or zombie.type.value != "horda" or horde_radius <= 0:
            continue
        frontier = {zombie.node}
        seen = set(frontier)
        for _ in range(horde_radius):
            frontier = {
                edge.target for node in frontier for edge in graph.neighbors(node)
            } - seen
            seen.update(frontier)
        danger.update(seen)
    return danger


def dangerous_edges(world: WorldLike) -> set[tuple[str, str]]:
    """Último desplazamiento observable de cada zombie, como origen/destino."""
    return {
        (z.previous_node, z.node)
        for z in world.zombies.values()
        if z.visible and z.previous_node is not None
    }


def is_safe_step(
    graph: GraphLike,
    world: WorldLike,
    start: str,
    target: str,
    *,
    horde_radius: int = 1,
    danger: set[str] | None = None,
    frontal_edges: set[tuple[str, str]] | None = None,
) -> bool:
    """Valida que el paso sea vecino abierto y no entre en un peligro conocido."""
    if start not in graph.nodes or target not in graph.nodes:
        return False
    if start == target:
        return target not in (danger if danger is not None else dangerous_nodes(graph, world, horde_radius))
    if not graph.has_edge(start, target) or world.is_blocked(start, target):
        return False
    danger = danger if danger is not None else dangerous_nodes(graph, world, horde_radius)
    if target in danger:
        return False
    frontal_edges = frontal_edges if frontal_edges is not None else dangerous_edges(world)
    return (target, start) not in frontal_edges


def danger_signature(world: WorldLike) -> tuple:
    """Huella hashable para renovar rutas al cambiar amenaza o calles cerradas."""
    zombies = tuple(sorted(
        (z.id, z.node, z.previous_node, z.type.value, z.visible)
        for z in world.zombies.values()
    ))
    return tuple(sorted(world.blocked_edges)), zombies
