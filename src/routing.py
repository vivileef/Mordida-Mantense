from __future__ import annotations

from .graph import CityGraph
from .model import WorldState
from .route_engine.hazards import dangerous_edges, dangerous_nodes, is_safe_step
from .route_engine.paths import alternative_safe_paths, shortest_safe_path


def safe_step(graph: CityGraph, world: WorldState, start: str, target: str, *, horde_radius: int = 1) -> bool:
    """Compatibilidad con consumidores previos; delega en route_engine."""
    return is_safe_step(graph, world, start, target, horde_radius=horde_radius)
