from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class ZombieType(str, Enum):
    """Tipos de amenaza que el simulador deberá mover por turnos."""

    WALKER = "caminante"
    RUNNER = "corredor"
    HORDE = "horda"
    SLEEPER = "dormido"


@dataclass(frozen=True)
class Edge:
    """Conexión dirigida del grafo; el mapa agrega la conexión inversa aparte."""

    target: str
    distance_m: float
    street_type: str


@dataclass
class Zombie:
    """Estado mínimo de un zombie dentro del mapa."""

    id: str
    type: ZombieType
    node: str
    visible: bool = True
    previous_node: str | None = None


@dataclass
class Survivor:
    """Sobreviviente activo y refugio que tiene asignado."""

    id: str
    node: str
    refuge_id: str
    active: bool = True
    previous_node: str | None = None


@dataclass(frozen=True)
class Refuge:
    """Punto de evacuación con capacidad configurable."""

    id: str
    node: str
    capacity: int = 100


@dataclass(frozen=True)
class CityEvent:
    """Cierre de una calle que se aplica automáticamente en un turno."""

    turn: int
    event_type: str
    edge: tuple[str, str]
    description: str


@dataclass
class WorldState:
    """Estado compartido que consultan el planificador y la API."""

    turn: int = 0
    blocked_edges: set[tuple[str, str]] = field(default_factory=set)
    zombies: dict[str, Zombie] = field(default_factory=dict)
    survivors: dict[str, Survivor] = field(default_factory=dict)
    refuges: dict[str, Refuge] = field(default_factory=dict)
    scheduled_events: list[CityEvent] = field(default_factory=list)
    events: list[CityEvent] = field(default_factory=list)

    def is_blocked(self, source: str, target: str) -> bool:
        # Las calles se consideran bloqueadas en ambas direcciones.
        return (source, target) in self.blocked_edges or (
            target,
            source,
        ) in self.blocked_edges
