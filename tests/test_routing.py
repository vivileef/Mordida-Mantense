import unittest
import random

from src.graph import CityGraph
from src.model import Survivor, Zombie, ZombieType
from src.simulator import ApocalypseSimulator
from src.service import RouteService


class RouteServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        # Cada prueba parte de un mundo independiente y determinista.
        self.service = RouteService(CityGraph.demo())

    def test_returns_a_neighbor_on_an_open_edge(self) -> None:
        """El contrato no permite saltos a nodos no conectados."""
        current = "N-0013"
        next_node = self.service.next_step("S-0001", current, 0)
        self.assertTrue(
            self.service.graph.has_edge(current, next_node) or current == next_node
        )

    def test_horde_node_and_neighbors_are_avoided(self) -> None:
        """La primera versión trata la zona inmediata de la horda como peligrosa."""
        self.service.world.zombies = {
            "Z-HORDE": Zombie("Z-HORDE", ZombieType.HORDE, "N-0002")
        }
        next_node = self.service.next_step("S-0001", "N-0013", 0)
        self.assertNotEqual(next_node, "N-0002")
        self.assertNotEqual(next_node, "N-0001")
        self.assertNotEqual(next_node, "N-0003")
        self.assertNotEqual(next_node, "N-0007")

    def test_unknown_survivor_stays_put(self) -> None:
        """Una petición inválida no debe mover a otro sobreviviente."""
        self.assertEqual(self.service.next_step("S-9999", "N-0013", 0), "N-0013")


class ApocalypseSimulatorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.graph = CityGraph.demo()
        self.service = RouteService(self.graph)
        self.simulator = ApocalypseSimulator(
            self.graph, self.service.world, random.Random(4)
        )

    def test_turn_moves_walker_and_increments_turn(self) -> None:
        walker = self.service.world.zombies["Z-0001"]
        original = walker.node
        self.simulator.advance_turn()
        self.assertEqual(self.service.world.turn, 1)
        self.assertNotEqual(walker.node, original)

    def test_sleeper_wakes_near_survivor(self) -> None:
        sleeper = Zombie("Z-SLEEPER", ZombieType.SLEEPER, "N-0013", False)
        self.service.world.zombies = {"Z-SLEEPER": sleeper}
        self.simulator.advance_turn()
        self.assertTrue(sleeper.visible)
        self.assertEqual(sleeper.type, ZombieType.WALKER)

    def test_shared_node_marks_survivor_inactive(self) -> None:
        self.service.world.zombies = {
            "Z-001": Zombie("Z-001", ZombieType.WALKER, "N-0013")
        }
        self.simulator.advance_turn()
        self.assertFalse(self.service.world.survivors["S-0001"].active)

    def test_city_event_blocks_an_edge(self) -> None:
        self.simulator.block_edge("N-0013", "N-0014")
        self.assertTrue(self.service.world.is_blocked("N-0014", "N-0013"))


if __name__ == "__main__":
    unittest.main()
