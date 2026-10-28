from __future__ import annotations

import importlib.util
import json
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request


MODULE_PATH = Path(__file__).with_name("generar_grafo.py")
SPEC = importlib.util.spec_from_file_location("generar_grafo", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("No se pudo cargar generar_grafo.py para las pruebas.")
generar_grafo = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(generar_grafo)


class FakeResponse:
    def __init__(self, status: int, payload: dict):
        self.status = status
        self.payload = json.dumps(payload).encode("utf-8")

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, exc_type, exc_value, traceback) -> None:
        return None

    def read(self) -> bytes:
        return self.payload


class OverpassEndpointTests(unittest.TestCase):
    def test_uses_interpreter_post_and_accepts_json_response(self) -> None:
        captured: dict[str, object] = {}

        def fake_urlopen(request: Request, timeout: float) -> FakeResponse:
            captured["url"] = request.full_url
            captured["method"] = request.method
            captured["data"] = request.data
            captured["timeout"] = timeout
            return FakeResponse(200, {"elements": [{"tags": {"total": 0}}]})

        with patch.object(generar_grafo, "urlopen", side_effect=fake_urlopen):
            ok, message = generar_grafo.check_overpass_endpoint(
                "https://overpass.private.coffee/api/"
            )

        self.assertTrue(ok)
        self.assertIn("HTTP 200", message)
        self.assertEqual(captured["url"], "https://overpass.private.coffee/api/interpreter")
        self.assertEqual(captured["method"], "POST")
        self.assertIn(b"data=", captured["data"])
        self.assertIn(b"out%3Ajson", captured["data"])
        self.assertEqual(captured["timeout"], 15.0)

    def test_reports_timeout_without_marking_endpoint_available(self) -> None:
        with patch.object(
            generar_grafo,
            "urlopen",
            side_effect=TimeoutError("timed out"),
        ):
            ok, message = generar_grafo.check_overpass_endpoint(
                "https://overpass.private.coffee/api"
            )

        self.assertFalse(ok)
        self.assertIn("timeout", message)

    def test_reports_http_error_without_marking_endpoint_available(self) -> None:
        error = HTTPError(
            "https://overpass.private.coffee/api/interpreter",
            502,
            "Bad Gateway",
            {},
            None,
        )
        with patch.object(generar_grafo, "urlopen", side_effect=error):
            ok, message = generar_grafo.check_overpass_endpoint(
                "https://overpass.private.coffee/api"
            )

        self.assertFalse(ok)
        self.assertIn("HTTP 502", message)


if __name__ == "__main__":
    unittest.main()
