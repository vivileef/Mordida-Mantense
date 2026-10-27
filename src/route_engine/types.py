from __future__ import annotations

from typing import Protocol


class EdgeLike(Protocol):
    target: str
    distance_m: float


class GraphLike(Protocol):
    nodes: dict

    def neighbors(self, node: str) -> list[EdgeLike]: ...
    def has_edge(self, source: str, target: str) -> bool: ...


class ZombieLike(Protocol):
    id: str
    node: str
    previous_node: str | None
    visible: bool
    type: object


class WorldLike(Protocol):
    zombies: dict[str, ZombieLike]
    blocked_edges: set[tuple[str, str]]

    def is_blocked(self, source: str, target: str) -> bool: ...
