from __future__ import annotations

import json
import threading
import unittest
from http.server import ThreadingHTTPServer
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from src.graph import CityGraph
from src.model import Edge, Refuge, Survivor, WorldState, Zombie, ZombieType
from src.routing import alternative_safe_paths, safe_step, shortest_safe_path
from src.server import ApiHandler
from src.service import RouteService
from src.route_engine.paths import select_refuge_routes


def graph_fixture() -> CityGraph:
    nodes = {key: (0.0, float(i)) for i, key in enumerate("ABCDE")}
    edges = {key: [] for key in nodes}
    def link(a, b, distance=1):
        edges[a].append(Edge(b, distance, "calle"))
        edges[b].append(Edge(a, distance, "calle"))
    link("A", "B"); link("B", "D"); link("A", "C"); link("C", "D"); link("D", "E"); link("B", "E")
    return CityGraph(nodes, edges)


class RoutingBehaviorTests(unittest.TestCase):
    def setUp(self):
        self.graph = graph_fixture()
        self.world = WorldState(refuges={"R": Refuge("R", "D"), "R2": Refuge("R2", "E")},
                                survivors={"S": Survivor("S", "A", "R")})

    def test_shortest_route_and_blocked_street_alternative(self):
        self.assertEqual(shortest_safe_path(self.graph, self.world, "A", "D"), ["A", "B", "D"])
        self.world.blocked_edges.add(("A", "B"))
        self.assertEqual(shortest_safe_path(self.graph, self.world, "A", "D"), ["A", "C", "D"])

    def test_alternative_routes_are_returned(self):
        paths = alternative_safe_paths(self.graph, self.world, "A", "D", count_paths=2)
        self.assertGreaterEqual(len(paths), 2)
        self.assertNotEqual(paths[0], paths[1])

    def test_alternatives_are_sorted_by_total_cost_2_2_5(self):
        nodes = {node: (0.0, 0.0) for node in ("S", "A", "B", "C", "G")}
        edges = {node: [] for node in nodes}
        for source, target, distance in (
            ("S", "A", 1), ("A", "G", 1),
            ("S", "B", 1), ("B", "G", 1),
            ("S", "C", 2), ("C", "G", 3),
        ):
            edges[source].append(Edge(target, distance, "calle"))
            edges[target].append(Edge(source, distance, "calle"))
        graph = CityGraph(nodes, edges)

        paths = alternative_safe_paths(graph, self.world, "S", "G", count_paths=3)
        costs = [sum(min(e.distance_m for e in graph.neighbors(a) if e.target == b)
                     for a, b in zip(path, path[1:])) for path in paths]

        self.assertEqual(costs, [2, 2, 5])

    def test_parallel_edges_use_the_cheapest_distance_for_ordering(self):
        nodes = {node: (0.0, 0.0) for node in ("S", "A", "B", "C", "G")}
        edges = {node: [] for node in nodes}
        links = (
            ("S", "A", 1), ("A", "G", 1),
            ("S", "B", 10), ("S", "B", 1), ("B", "G", 1),
            ("S", "C", 2), ("C", "G", 3),
        )
        for source, target, distance in links:
            edges[source].append(Edge(target, distance, "calle"))
            edges[target].append(Edge(source, distance, "calle"))
        graph = CityGraph(nodes, edges)

        paths = alternative_safe_paths(graph, self.world, "S", "G", count_paths=3)

        self.assertEqual(paths, [["S", "A", "G"], ["S", "B", "G"], ["S", "C", "G"]])

    def test_refuge_selection_uses_cheapest_parallel_edge(self):
        nodes = {node: (0.0, 0.0) for node in ("S", "A", "B", "R1", "R2")}
        edges = {node: [] for node in nodes}
        for source, target, distance in (
            ("S", "A", 100), ("S", "A", 1), ("A", "R1", 1),
            ("S", "B", 4), ("B", "R2", 1),
        ):
            edges[source].append(Edge(target, distance, "calle"))
            edges[target].append(Edge(source, distance, "calle"))
        graph = CityGraph(nodes, edges)
        refuges = [Refuge("R1", "R1"), Refuge("R2", "R2")]

        routes = select_refuge_routes(
            graph, WorldState(), "S", refuges,
            preferred_refuge_id="R2", limit=1,
        )

        self.assertEqual(routes, [["S", "A", "R1"]])

    def test_route_details_reports_cheapest_parallel_street(self):
        nodes = {node: (0.0, 0.0) for node in ("S", "A", "G")}
        edges = {node: [] for node in nodes}
        edges["S"].extend([Edge("A", 10, "calle", "larga"), Edge("A", 1, "calle", "corta")])
        edges["A"].append(Edge("G", 1, "calle", "final"))
        graph = CityGraph(nodes, edges)
        service = RouteService(graph)
        service.world.survivors = {"S-TEST": Survivor("S-TEST", "S", "R-TEST")}
        service.world.refuges = {"R-TEST": Refuge("R-TEST", "G")}
        service.world.zombies = {}

        route = service.route_details("S-TEST")

        self.assertEqual(route["distancia_m"], 2)
        self.assertEqual(route["calles"][0]["nombre"], "corta")

    def test_planned_routes_reports_cheapest_parallel_street(self):
        nodes = {node: (0.0, 0.0) for node in ("S", "A", "G")}
        edges = {node: [] for node in nodes}
        edges["S"].extend([Edge("A", 10, "calle", "larga"), Edge("A", 1, "calle", "corta")])
        edges["A"].append(Edge("G", 1, "calle", "final"))
        graph = CityGraph(nodes, edges)
        service = RouteService(graph)
        service.world.survivors = {"S-TEST": Survivor("S-TEST", "S", "R-TEST")}
        service.world.refuges = {"R-TEST": Refuge("R-TEST", "G")}
        service.world.zombies = {}

        planned = service.planned_routes()[0]

        self.assertEqual(planned["nodos"], ["S", "A", "G"])
        street_name = planned["calles"][0]["nombre"]
        self.assertEqual(street_name, "corta")
        selected_edge = next(edge for edge in graph.neighbors("S") if edge.name == street_name)
        self.assertEqual(selected_edge.distance_m, 1)

    def test_alternative_search_returns_empty_when_no_route_exists(self):
        self.world.blocked_edges.update({("A", "B"), ("A", "C")})
        self.assertEqual(alternative_safe_paths(self.graph, self.world, "A", "D"), [])

    def test_city_graph_and_dijkstra_reject_negative_distances(self):
        nodes = {"S": (0.0, 0.0), "G": (0.0, 1.0)}
        data = {
            "nodos": [
                {"id": "S", "lat": 0, "lng": 0},
                {"id": "G", "lat": 0, "lng": 1},
            ],
            "calles": [{"origen": "S", "destino": "G", "distancia_m": -1, "tipo": "calle"}],
        }
        with self.assertRaisesRegex(ValueError, "no negativa"):
            CityGraph.from_dict(data)

        graph = CityGraph(nodes, {"S": [], "G": []})
        graph.edges["S"].append(Edge("G", -1, "calle"))
        with self.assertRaisesRegex(ValueError, "Dijkstra requiere"):
            shortest_safe_path(graph, WorldState(), "S", "G")

    def test_alternatives_when_routes_share_first_edge_are_unique_and_valid(self):
        nodes = {node: (0.0, 0.0) for node in ("S", "A", "X", "Y", "G")}
        edges = {node: [] for node in nodes}
        for source, target in (("S", "A"), ("A", "X"), ("X", "G"), ("A", "Y"), ("Y", "G")):
            edges[source].append(Edge(target, 1, "calle"))
            edges[target].append(Edge(source, 1, "calle"))
        graph = CityGraph(nodes, edges)

        paths = alternative_safe_paths(graph, self.world, "S", "G", count_paths=3)

        self.assertEqual(len(paths), 2)
        self.assertEqual(len({tuple(path) for path in paths}), len(paths))
        for path in paths:
            self.assertEqual(path[0], "S")
            self.assertEqual(path[-1], "G")
            for source, target in zip(path, path[1:]):
                self.assertTrue(graph.has_edge(source, target))
                self.assertFalse(self.world.is_blocked(source, target))
                self.assertTrue(safe_step(graph, self.world, source, target))
        self.assertEqual(paths[0][1], paths[1][1])
        self.assertNotEqual(paths[0], paths[1])

    def test_alternatives_when_routes_share_two_initial_edges(self):
        nodes = {node: (0.0, 0.0) for node in ("S", "A", "B", "X", "Y", "G")}
        edges = {node: [] for node in nodes}
        for source, target in (
            ("S", "A"), ("A", "B"), ("B", "X"), ("X", "G"),
            ("B", "Y"), ("Y", "G"),
        ):
            edges[source].append(Edge(target, 1, "calle"))
        graph = CityGraph(nodes, edges)

        paths = alternative_safe_paths(graph, self.world, "S", "G", count_paths=2)

        self.assertEqual(
            {tuple(path) for path in paths},
            {
                ("S", "A", "B", "X", "G"),
                ("S", "A", "B", "Y", "G"),
            },
        )
        self.assertEqual(paths[0][:3], paths[1][:3])
        self.assertNotEqual(paths[0], paths[1])
        for path in paths:
            self.assertEqual(path[0], "S")
            self.assertEqual(path[-1], "G")
            for source, target in zip(path, path[1:]):
                self.assertTrue(graph.has_edge(source, target))
                self.assertFalse(self.world.is_blocked(source, target))
                self.assertTrue(safe_step(graph, self.world, source, target))

    def test_origin_at_destination_returns_only_one_singleton_path(self):
        paths = alternative_safe_paths(self.graph, self.world, "D", "D", count_paths=3)
        self.assertEqual(paths, [["D"]])

    def test_only_one_safe_route_returns_no_extra_alternatives(self):
        self.world.blocked_edges.add(("A", "C"))
        self.world.blocked_edges.add(("B", "E"))
        paths = alternative_safe_paths(self.graph, self.world, "A", "D", count_paths=3)
        self.assertEqual(paths, [["A", "B", "D"]])

    def test_alternatives_filter_blocked_streets_and_dangerous_nodes(self):
        nodes = {node: (0.0, 0.0) for node in ("S", "A", "X", "Y", "B", "P", "Q", "G")}
        edges = {node: [] for node in nodes}
        for source, target in (("S", "A"), ("A", "X"), ("X", "G"),
                               ("A", "Y"), ("Y", "G"), ("S", "B"),
                               ("B", "P"), ("P", "G"), ("B", "Q"), ("Q", "G")):
            edges[source].append(Edge(target, 1, "calle"))
            edges[target].append(Edge(source, 1, "calle"))
        graph = CityGraph(nodes, edges)
        self.world.blocked_edges.add(("A", "Y"))
        self.world.zombies = {"Z": Zombie("Z", ZombieType.WALKER, "X")}

        paths = alternative_safe_paths(graph, self.world, "S", "G", count_paths=3)

        self.assertEqual(len(paths), 2)
        self.assertEqual(len({tuple(path) for path in paths}), 2)
        for path in paths:
            self.assertEqual((path[0], path[-1]), ("S", "G"))
            self.assertNotIn("X", path)
            self.assertNotIn("Y", path)
            for source, target in zip(path, path[1:]):
                self.assertTrue(graph.has_edge(source, target))
                self.assertFalse(self.world.is_blocked(source, target))
                self.assertTrue(safe_step(graph, self.world, source, target))

    def test_refuge_fallback_when_assigned_refuge_is_dangerous(self):
        service = RouteService(self.graph)
        service.world.survivors = {"S": Survivor("S", "A", "R")}
        service.world.refuges = self.world.refuges
        service.world.zombies = {"Z": Zombie("Z", ZombieType.WALKER, "D")}
        self.assertEqual(service.routes_for("S")[0][-1], "E")

    def test_planned_routes_handles_missing_assigned_refuge(self):
        service = RouteService(self.graph)
        service.world.survivors = {"S-MISSING-REFUGE": Survivor("S-MISSING-REFUGE", "A", "R-NO-EXISTE")}
        service.world.refuges = {
            "R": Refuge("R", "D"),
            "R2": Refuge("R2", "E"),
        }
        service.world.zombies = {}

        planned = service.planned_routes()

        self.assertEqual(len(planned), 1)
        self.assertEqual(planned[0]["sobrevivienteId"], "S-MISSING-REFUGE")
        self.assertEqual(planned[0]["refugioId"], "R")
        self.assertEqual(planned[0]["nodos"][0], "A")
        self.assertEqual(planned[0]["nodos"][-1], "D")

    def test_route_details_preserves_preferred_refuge_when_nodes_are_shared(self):
        service = RouteService(self.graph)
        service.world.survivors = {"S-SHARED-REFUGE": Survivor("S-SHARED-REFUGE", "A", "R-PREFERIDO")}
        # El orden de inserción hace que route_details encuentre primero el otro ID
        # si pierde la identidad seleccionada por el desempate del motor.
        service.world.refuges = {
            "R-OTRO": Refuge("R-OTRO", "D"),
            "R-PREFERIDO": Refuge("R-PREFERIDO", "D"),
        }
        service.world.zombies = {}

        routes = service.routes_for("S-SHARED-REFUGE", limit=1)
        details = service.route_details("S-SHARED-REFUGE")

        self.assertEqual(routes[0][-1], "D")
        self.assertEqual(details["nodos"][-1], "D")
        self.assertEqual(details["refugioId"], "R-PREFERIDO")

    def test_next_step_stays_when_all_first_moves_are_unsafe(self):
        service = RouteService(self.graph)
        service.world.survivors = {"S-TRAPPED": Survivor("S-TRAPPED", "A", "R")}
        service.world.refuges = {"R": Refuge("R", "D")}
        service.world.zombies = {
            "Z-B": Zombie("Z-B", ZombieType.WALKER, "B"),
            "Z-C": Zombie("Z-C", ZombieType.WALKER, "C"),
        }

        self.assertEqual(service.next_step("S-TRAPPED", "A", 0), "A")

    def test_zombie_horde_radius_configurable(self):
        self.world.zombies = {"Z": Zombie("Z", ZombieType.HORDE, "B")}
        self.assertIsNone(shortest_safe_path(self.graph, self.world, "A", "D", horde_radius=1))
        self.assertEqual(shortest_safe_path(self.graph, self.world, "A", "D", horde_radius=0), ["A", "C", "D"])

    def test_frontal_crossing_and_neighbor_validation(self):
        self.world.zombies = {"Z": Zombie("Z", ZombieType.RUNNER, "A", previous_node="B")}
        self.assertFalse(safe_step(self.graph, self.world, "A", "B"))
        self.assertFalse(safe_step(self.graph, self.world, "A", "E"))

    def test_no_safe_path_and_invalid_nodes(self):
        self.world.zombies = {"Z": Zombie("Z", ZombieType.WALKER, "B"), "Z2": Zombie("Z2", ZombieType.WALKER, "C")}
        self.assertIsNone(shortest_safe_path(self.graph, self.world, "A", "D"))
        self.assertFalse(safe_step(self.graph, self.world, "A", "E"))

    def test_cache_key_tracks_hazard_state(self):
        service = RouteService(self.graph)
        service.world.survivors = {"S": Survivor("S", "A", "R")}
        service.world.refuges = self.world.refuges
        first = service.routes_for("S")
        service.world.zombies["Z"] = Zombie("Z", ZombieType.WALKER, "B")
        second = service.routes_for("S")
        self.assertNotEqual(first, second)
        service.world.zombies.clear()
        open_route = service.routes_for("S")
        service.world.blocked_edges.add(("A", "B"))
        blocked_route = service.routes_for("S")
        self.assertNotEqual(open_route, blocked_route)

    def test_equivalent_route_query_reuses_cached_result(self):
        service = RouteService(self.graph)
        service.world.survivors = {"S": Survivor("S", "A", "R")}
        service.world.refuges = self.world.refuges
        service.world.zombies = {}

        with patch("src.service.select_refuge_routes", wraps=select_refuge_routes) as planner:
            first = service.routes_for("S")
            second = service.routes_for("S")

        self.assertEqual(first, second)
        planner.assert_called_once()

    def test_mutating_returned_routes_does_not_corrupt_cached_result(self):
        service = RouteService(self.graph)
        service.world.survivors = {"S": Survivor("S", "A", "R")}
        service.world.refuges = self.world.refuges
        service.world.zombies = {}

        first = service.routes_for("S")
        expected = [path.copy() for path in first]
        first[0].append("NOT-A-REAL-NODE")
        first.append(["CORRUPTED"])

        second = service.routes_for("S")

        self.assertEqual(second, expected)


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.old_key = ApiHandler.api_key
        cls.old_service = ApiHandler.service
        ApiHandler.api_key = "test-secret"
        ApiHandler.service = RouteService()
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), ApiHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown(); cls.server.server_close(); cls.thread.join()
        ApiHandler.api_key, ApiHandler.service = cls.old_key, cls.old_service

    def request(self, path, method="GET", body=None, key="test-secret"):
        headers = {}
        data = None
        if key is not None: headers["x-api-key"] = key
        if body is not None:
            data = json.dumps(body).encode(); headers["Content-Type"] = "application/json"
        return urlopen(Request(self.base + path, data=data, headers=headers, method=method))

    def test_post_paso_exact_contract_and_authentication(self):
        with self.assertRaises(HTTPError) as error:
            self.request("/paso", "POST", {"sobrevivienteId": "S-0001", "nodoActual": "N-0013", "turno": 1}, key=None)
        self.assertEqual(error.exception.code, 401)
        response = self.request("/paso", "POST", {"sobrevivienteId": "S-0001", "nodoActual": "N-0013", "turno": 1})
        self.assertEqual(set(json.loads(response.read())), {"siguienteNodo"})

    def test_route_map_health_and_cors(self):
        route = self.request("/ruta/S-0001")
        route_data = json.loads(route.read())
        self.assertIn("nodos", route_data)
        self.assertIn("alternativas", route_data)
        self.assertEqual(self.request("/mapa").status, 200)
        health = self.request("/salud")
        self.assertEqual(json.loads(health.read())["estado"], "ok")
        self.assertEqual(health.headers["Access-Control-Allow-Origin"], "*")
        preflight = self.request("/paso", method="OPTIONS")
        self.assertIn("x-api-key", preflight.headers["Access-Control-Allow-Headers"])

    def test_post_paso_stays_when_all_first_moves_are_unsafe(self):
        old_service = ApiHandler.service
        service = RouteService(graph_fixture())
        service.world.survivors = {"S-TRAPPED": Survivor("S-TRAPPED", "A", "R")}
        service.world.refuges = {"R": Refuge("R", "D")}
        service.world.zombies = {
            "Z-B": Zombie("Z-B", ZombieType.WALKER, "B"),
            "Z-C": Zombie("Z-C", ZombieType.WALKER, "C"),
        }
        ApiHandler.service = service
        try:
            response = self.request(
                "/paso",
                "POST",
                {"sobrevivienteId": "S-TRAPPED", "nodoActual": "A", "turno": 0},
            )
            payload = json.loads(response.read())

            self.assertEqual(set(payload), {"siguienteNodo"})
            self.assertEqual(payload["siguienteNodo"], "A")
        finally:
            ApiHandler.service = old_service

    def test_get_estado_handles_missing_assigned_refuge(self):
        old_service = ApiHandler.service
        service = RouteService(graph_fixture())
        service.world.survivors = {
            "S-MISSING-REFUGE": Survivor("S-MISSING-REFUGE", "A", "R-NO-EXISTE")
        }
        service.world.refuges = {
            "R": Refuge("R", "D"),
            "R2": Refuge("R2", "E"),
        }
        service.world.zombies = {}
        ApiHandler.service = service
        try:
            response = self.request("/estado")
            payload = json.loads(response.read())

            self.assertEqual(response.status, 200)
            self.assertEqual(payload["rutas"][0]["sobrevivienteId"], "S-MISSING-REFUGE")
            self.assertEqual(payload["rutas"][0]["refugioId"], "R")
        finally:
            ApiHandler.service = old_service


if __name__ == "__main__":
    unittest.main()
