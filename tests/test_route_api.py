from __future__ import annotations

import json
import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from src.graph import CityGraph
from src.model import Edge, Refuge, Survivor, WorldState, Zombie, ZombieType
from src.routing import alternative_safe_paths, safe_step, shortest_safe_path
from src.server import ApiHandler
from src.service import RouteService


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

    def test_refuge_fallback_when_assigned_refuge_is_dangerous(self):
        service = RouteService(self.graph)
        service.world.survivors = {"S": Survivor("S", "A", "R")}
        service.world.refuges = self.world.refuges
        service.world.zombies = {"Z": Zombie("Z", ZombieType.WALKER, "D")}
        self.assertEqual(service.routes_for("S")[0][-1], "E")

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


if __name__ == "__main__":
    unittest.main()
