from __future__ import annotations

from dataclasses import dataclass
from math import hypot

from .model import Edge


@dataclass
class CityGraph:
    """Grafo de intersecciones y calles transitables."""

    nodes: dict[str, tuple[float, float]]
    edges: dict[str, list[Edge]]

    def neighbors(self, node: str) -> list[Edge]:
        # Un nodo desconocido no debe romper una petición de ruta.
        return self.edges.get(node, [])

    def has_edge(self, source: str, target: str) -> bool:
        return any(edge.target == target for edge in self.neighbors(source))

    def heuristic(self, source: str, target: str) -> float:
        # La distancia geográfica aproximada guía A* hacia el refugio.
        x1, y1 = self.nodes[source]
        x2, y2 = self.nodes[target]
        return hypot(x1 - x2, y1 - y2) * 100

    @classmethod
    def demo(cls) -> CityGraph:
        """Cuadrícula pequeña que reemplaza temporalmente al mapa real de Manta."""
        nodes: dict[str, tuple[float, float]] = {}
        edges: dict[str, list[Edge]] = {}
        width = 5
        for row in range(width):
            for column in range(width):
                node = f"N-{row * width + column + 1:04d}"
                nodes[node] = (-0.95 + column * 0.01, -80.72 + row * 0.01)
                edges[node] = []

        def connect(first: str, second: str, street_type: str = "calle") -> None:
            # La avenida del demo es más corta para representar una vía rápida.
            distance = 100 if street_type == "avenida" else 120
            edges[first].append(Edge(second, distance, street_type))
            edges[second].append(Edge(first, distance, street_type))

        for row in range(width):
            for column in range(width):
                number = row * width + column + 1
                if column < width - 1:
                    connect(f"N-{number:04d}", f"N-{number + 1:04d}", "avenida")
                if row < width - 1:
                    connect(f"N-{number:04d}", f"N-{number + width:04d}")
        return cls(nodes, edges)
