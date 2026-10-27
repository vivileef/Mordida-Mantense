import unittest
import random
from time import perf_counter
from threading import Event

from src.graph import CityGraph
from src.model import Zombie, ZombieType
from src.simulator import ApocalypseSimulator
from src.service import RouteService
from src.scenarios import build_scenario
from src.turn_loop import TurnLoop


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

    def test_state_exposes_previous_nodes_and_map_nodes(self) -> None:
        state = self.service.state()
        self.assertIn("nodoAnterior", state["sobrevivientes"][0])
        self.assertEqual(len(state["nodos"]), 25)
        self.assertIn("rutas", state)
        self.assertIn("nombre", state["nodos"][0])
        self.assertTrue(state["rutas"][0]["calles"])

    def test_graph_can_load_frontend_map_contract(self) -> None:
        graph = CityGraph.from_dict(
            {
                "nodos": [
                    {"id": "A", "lat": 1, "lng": 2},
                    {"id": "B", "lat": 3, "lng": 4},
                ],
                "calles": [
                    {
                        "origen": "A",
                        "destino": "B",
                        "distancia_m": 50,
                        "tipo": "puente",
                        "nombre": "Puente de prueba",
                    }
                ],
            }
        )
        self.assertTrue(graph.has_edge("A", "B"))
        self.assertEqual(graph.nodes["B"], (3.0, 4.0))
        self.assertEqual(graph.neighbors("A")[0].name, "Puente de prueba")

    def test_confirmed_move_updates_survivor_position(self) -> None:
        self.assertTrue(self.service.move_survivor("S-0001", "N-0014"))
        survivor = self.service.world.survivors["S-0001"]
        self.assertEqual(survivor.node, "N-0014")
        self.assertEqual(survivor.previous_node, "N-0013")


class ApocalypseSimulatorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.graph = CityGraph.demo()
        self.service = RouteService(self.graph)
        self.simulator = ApocalypseSimulator(
            self.graph, self.service.world, random.Random(4)
        )

    def test_walker_moves_only_on_even_turns(self) -> None:
        walker = self.service.world.zombies["Z-0001"]
        original = walker.node
        self.simulator.advance_turn()
        self.assertEqual(self.service.world.turn, 1)
        self.assertEqual(walker.node, original)
        self.simulator.advance_turn()
        self.assertEqual(self.service.world.turn, 2)
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

    def test_opposite_crossing_marks_survivor_inactive(self) -> None:
        survivor = self.service.world.survivors["S-0001"]
        survivor.node = "N-0014"
        survivor.previous_node = "N-0014"
        self.service.world.zombies = {
            "Z-001": Zombie(
                "Z-001",
                ZombieType.WALKER,
                "N-0014",
                previous_node="N-0013",
            )
        }
        self.simulator.move_survivor("S-0001", "N-0013")
        self.simulator._mark_bites()
        self.assertFalse(survivor.active)

    def test_survivor_move_rejects_non_neighbor(self) -> None:
        self.assertFalse(self.simulator.move_survivor("S-0001", "N-0025"))


class TurnLoopTests(unittest.TestCase):
    def test_loop_advances_until_stopped(self) -> None:
        turns: list[int] = []
        advanced = Event()

        def advance() -> int:
            turns.append(len(turns) + 1)
            advanced.set()
            return len(turns)

        loop = TurnLoop(advance, 0.01)
        loop.start()
        self.assertTrue(loop.is_running())
        self.assertTrue(advanced.wait(0.2))
        loop.stop()
        self.assertGreaterEqual(len(turns), 1)
        self.assertFalse(loop.is_running())

    def test_loop_does_not_start_twice(self) -> None:
        loop = TurnLoop(lambda: 1, 0.1)
        loop.start()
        first_thread = loop._thread
        loop.start()
        self.assertIs(loop._thread, first_thread)
        loop.stop()


class ScenarioTests(unittest.TestCase):
    def test_fire_round_sizes(self) -> None:
        self.assertEqual(len(build_scenario("ronda1").survivors), 20)
        self.assertEqual(len(build_scenario("ronda2").survivors), 80)
        self.assertEqual(len(build_scenario("ronda3").survivors), 200)

    def test_round_three_applies_two_scheduled_events(self) -> None:
        service = RouteService(scenario="ronda3")
        for _ in range(20):
            service.simulate_turn()
        self.assertEqual(service.world.turn, 20)
        self.assertEqual(len(service.world.events), 2)
        self.assertEqual(len(service.world.blocked_edges), 2)

    def test_round_three_state_supports_200_survivors(self) -> None:
        service = RouteService(scenario="ronda3")
        started = perf_counter()
        state = service.state()
        elapsed = perf_counter() - started
        self.assertEqual(len(state["sobrevivientes"]), 200)
        self.assertLess(elapsed, 1.0)

    def test_unknown_scenario_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            build_scenario("ronda4")


if __name__ == "__main__":
    unittest.main()
