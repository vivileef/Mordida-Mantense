from __future__ import annotations

from dataclasses import dataclass
from math import hypot, isfinite
from typing import Any

from .model import Edge


@dataclass
class CityGraph:
    """Grafo de intersecciones y calles transitables."""

    nodes: dict[str, tuple[float, float]]
    edges: dict[str, list[Edge]]
    node_names: dict[str, str] | None = None

    def __post_init__(self) -> None:
        """Rechaza pesos inválidos al crear el grafo, sin cambiar su estructura."""
        for source, edges in self.edges.items():
            for edge in edges:
                if not isfinite(edge.distance_m) or edge.distance_m < 0:
                    raise ValueError(
                        f"distancia_m inválida en {source}->{edge.target}: "
                        "debe ser finita y no negativa"
                    )

    def neighbors(self, node: str) -> list[Edge]:
        # Un nodo desconocido no debe romper una petición de ruta.
        return self.edges.get(node, [])

    def has_edge(self, source: str, target: str) -> bool:
        return any(edge.target == target for edge in self.neighbors(source))

    def as_dict(self) -> dict:
        """Serializa nodos y calles para que el frontend pueda dibujar el mapa."""
        return {
            "nodos": [
                {
                    "id": node,
                    "nombre": self.node_name(node),
                    "lat": coordinates[0],
                    "lng": coordinates[1],
                }
                for node, coordinates in self.nodes.items()
            ],
            "calles": [
                {
                    "origen": source,
                    "destino": edge.target,
                    "distancia_m": edge.distance_m,
                    "tipo": edge.street_type,
                    "nombre": edge.name,
                    **(
                        {
                            "geometry": {
                                "type": "LineString",
                                "coordinates": [list(point) for point in edge.geometry],
                            }
                        }
                        if edge.geometry
                        else {}
                    ),
                }
                for source, edges in self.edges.items()
                for edge in edges
            ],
        }

    def node_name(self, node: str) -> str:
        return (self.node_names or {}).get(node, f"Intersección {node}")

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> CityGraph:
        """Carga un mapa preparado desde el formato JSON documentado."""
        nodes = {
            item["id"]: (float(item["lat"]), float(item["lng"]))
            for item in data["nodos"]
        }
        node_names = {
            item["id"]: item["nombre"]
            for item in data["nodos"]
            if item.get("nombre")
        }
        edges = {node: [] for node in nodes}
        for item in data["calles"]:
            source = item["origen"]
            target = item["destino"]
            edge = Edge(
                target=target,
                distance_m=float(item["distancia_m"]),
                street_type=str(item["tipo"]),
                name=str(item.get("nombre", "calle sin nombre")),
                geometry=tuple(
                    (float(point[0]), float(point[1]))
                    for point in item.get("geometry", {}).get("coordinates", [])
                    if isinstance(point, (list, tuple)) and len(point) >= 2
                ),
            )
            edges[source].append(edge)
        return cls(nodes, edges, node_names)

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
            row = int(first[2:]) // width
            column = int(first[2:]) % width
            name = (
                f"Av. 4 de Noviembre {row + 1}"
                if street_type == "avenida"
                else f"Calle {column + 1} de Manta"
            )
            edges[first].append(Edge(second, distance, street_type, name))
            edges[second].append(Edge(first, distance, street_type, name))

        for row in range(width):
            for column in range(width):
                number = row * width + column + 1
                if column < width - 1:
                    connect(f"N-{number:04d}", f"N-{number + 1:04d}", "avenida")
                if row < width - 1:
                    connect(f"N-{number:04d}", f"N-{number + width:04d}")
        node_names = {
            node: f"Intersección Av. {4 + index % 4} de Noviembre / Calle {1 + index // 5}"
            for index, node in enumerate(nodes)
        }
        return cls(nodes, edges, node_names)
