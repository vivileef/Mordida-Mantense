from __future__ import annotations

from .graph import CityGraph
from .model import CityEvent, Refuge, RescueVehicle, Survivor, WorldState, Zombie, ZombieType


SCENARIO_SIZES = {"ronda1": 20, "ronda2": 80, "ronda3": 200}


def build_scenario(name: str, graph: CityGraph | None = None) -> WorldState:
    """Construye uno de los escenarios oficiales de la prueba de fuego."""
    graph = graph or CityGraph.demo()
    name = name.lower()
    try:
        survivor_count = SCENARIO_SIZES[name]
    except KeyError as error:
        valid = ", ".join(SCENARIO_SIZES)
        raise ValueError(f"Escenario desconocido: {name}. Use: {valid}") from error

    refuges = {
        "R-001": Refuge("R-001", "N-0001", capacity=survivor_count),
        "R-002": Refuge("R-002", "N-0005", capacity=survivor_count),
        "R-003": Refuge("R-003", "N-0021", capacity=survivor_count),
        "R-004": Refuge("R-004", "N-0025", capacity=survivor_count),
    }
    nodes = list(graph.nodes)
    survivors = {
        f"S-{number:04d}": Survivor(
            id=f"S-{number:04d}",
            node=nodes[(number * 3) % len(nodes)],
            refuge_id=list(refuges)[number % len(refuges)],
        )
        for number in range(1, survivor_count + 1)
    }
    zombies = _zombies_for(name, nodes)
    events = _events_for(name, graph)
    vehicles = {
        f"V-{number:02d}": RescueVehicle(
            f"V-{number:02d}",
            list(refuges.values())[(number - 1) % len(refuges)].node,
        )
        for number in range(1, 6)
    }
    return WorldState(
        survivors=survivors,
        zombies=zombies,
        refuges=refuges,
        scheduled_events=events,
        rescue_vehicles=vehicles,
    )


def _zombies_for(name: str, nodes: list[str]) -> dict[str, Zombie]:
    if name == "ronda1":
        types = [ZombieType.WALKER] * 8
    elif name == "ronda2":
        types = (
            [ZombieType.WALKER] * 12
            + [ZombieType.RUNNER] * 6
            + [ZombieType.HORDE] * 2
        )
    else:
        types = (
            [ZombieType.WALKER] * 20
            + [ZombieType.RUNNER] * 12
            + [ZombieType.HORDE] * 4
            + [ZombieType.SLEEPER] * 8
        )
    return {
        f"Z-{number:04d}": Zombie(
            id=f"Z-{number:04d}",
            type=zombie_type,
            node=nodes[(number * 5 + 2) % len(nodes)],
            visible=zombie_type != ZombieType.SLEEPER,
        )
        for number, zombie_type in enumerate(types, start=1)
    }


def _events_for(name: str, graph: CityGraph | None = None) -> list[CityEvent]:
    if name == "ronda1":
        return []
    fallback_edges = iter(
        (source, edge.target)
        for source in (graph.nodes if graph else [])
        for edge in (graph.neighbors(source) if graph else [])
    )

    def valid_edge(edge: tuple[str, str]) -> tuple[str, str]:
        if graph and graph.has_edge(*edge):
            return edge
        return next(fallback_edges, edge)

    events = [
        CityEvent(
            turn=10,
            event_type="puente_colapsado",
            edge=valid_edge(("N-0005", "N-0010")),
            description="El puente principal colapsó.",
        )
    ]
    if name == "ronda3":
        events.append(
            CityEvent(
                turn=20,
                event_type="avenida_bloqueada",
                edge=valid_edge(("N-0011", "N-0012")),
                description="Una avenida quedó bloqueada por un accidente.",
            )
        )
    return events
