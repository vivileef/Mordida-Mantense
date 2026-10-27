"""Motor de rutas que consume el grafo y estado compartidos del simulador."""

from .hazards import dangerous_edges, dangerous_nodes, is_safe_step
from .paths import alternative_safe_paths, shortest_safe_path, select_refuge_routes

__all__ = [
    "alternative_safe_paths",
    "dangerous_edges",
    "dangerous_nodes",
    "is_safe_step",
    "select_refuge_routes",
    "shortest_safe_path",
]
