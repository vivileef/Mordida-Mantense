from __future__ import annotations

import random
from collections import deque

from .graph import CityGraph
from .model import WorldState, Zombie, ZombieType


class ApocalypseSimulator:
    """Ejecuta un turno del mundo sin mezclarlo con la capa HTTP."""

    def __init__(
        self,
        graph: CityGraph,
        world: WorldState,
        random_source: random.Random | None = None,
    ) -> None:
        self.graph = graph
        self.world = world
        self.random = random_source or random.Random()

    def advance_turn(self) -> int:
        """Mueve amenazas, despierta dormidos y marca sobrevivientes mordidos."""
        self.world.turn += 1
        self._apply_scheduled_events()
        self._move_zombies()
        self._wake_sleepers()
        self._refresh_horde_blocks()
        self._mark_bites()
        return self.world.turn

    def _apply_scheduled_events(self) -> None:
        for event in self.world.scheduled_events:
            if event.turn == self.world.turn and event not in self.world.events:
                self.block_edge(*event.edge)
                self.world.events.append(event)

    def block_edge(self, source: str, target: str) -> None:
        """Registra un evento de ciudad que cierra una calle en ambos sentidos."""
        if self.graph.has_edge(source, target):
            self.world.blocked_edges.add((source, target))

    def _move_zombies(self) -> None:
        for zombie in self.world.zombies.values():
            zombie.previous_node = zombie.node
            if not zombie.visible or zombie.type == ZombieType.HORDE:
                continue
            if zombie.type == ZombieType.SLEEPER:
                continue
            if zombie.type == ZombieType.WALKER and self.world.turn % 2:
                continue
            steps = 1 if zombie.type == ZombieType.WALKER else 2
            for _ in range(steps):
                target = self._next_zombie_node(zombie)
                if target is None:
                    break
                zombie.node = target

    def _next_zombie_node(self, zombie: Zombie) -> str | None:
        candidates = [
            edge.target
            for edge in self.graph.neighbors(zombie.node)
            if not self.world.is_blocked(zombie.node, edge.target)
        ]
        if not candidates:
            return None
        if zombie.type == ZombieType.RUNNER:
            target = self._closest_survivor_node(zombie.node)
            if target is not None:
                candidates.sort(
                    key=lambda node: self._hop_distance(node, target)
                )
                return candidates[0]
        return self.random.choice(candidates)

    def _closest_survivor_node(self, origin: str) -> str | None:
        survivors = [
            survivor
            for survivor in self.world.survivors.values()
            if survivor.active and self._hop_distance(origin, survivor.node) <= 3
        ]
        if not survivors:
            return None
        return min(
            (survivor.node for survivor in survivors),
            key=lambda node: self._hop_distance(origin, node),
        )

    def _hop_distance(self, start: str, goal: str) -> int:
        if start == goal:
            return 0
        queue = deque([(start, 0)])
        visited = {start}
        while queue:
            current, distance = queue.popleft()
            for edge in self.graph.neighbors(current):
                if self.world.is_blocked(current, edge.target):
                    continue
                if edge.target == goal:
                    return distance + 1
                if edge.target not in visited:
                    visited.add(edge.target)
                    queue.append((edge.target, distance + 1))
        return 10**9

    def _wake_sleepers(self) -> None:
        for zombie in self.world.zombies.values():
            if zombie.type != ZombieType.SLEEPER or zombie.visible:
                continue
            if any(
                survivor.active
                and self._hop_distance(zombie.node, survivor.node) <= 2
                for survivor in self.world.survivors.values()
            ):
                zombie.visible = True
                zombie.type = ZombieType.WALKER

    def _refresh_horde_blocks(self) -> None:
        # Las hordas no modifican las calles: su zona peligrosa la calcula routing.
        # Este método deja un punto único para futuras reglas de bloqueo persistente.
        return

    def _mark_bites(self) -> None:
        for survivor in self.world.survivors.values():
            if not survivor.active:
                continue
            shares_node = any(
                zombie.visible and zombie.node == survivor.node
                for zombie in self.world.zombies.values()
            )
            crossed_zombie = any(
                zombie.visible
                and zombie.previous_node == survivor.node
                and zombie.node != survivor.node
                and self.graph.has_edge(zombie.node, survivor.node)
                for zombie in self.world.zombies.values()
            )
            if shares_node or crossed_zombie:
                survivor.active = False
