import unittest

from src.graph import CityGraph
from src.model import Zombie, ZombieType
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


if __name__ == "__main__":
    unittest.main()
