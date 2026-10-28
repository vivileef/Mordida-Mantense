from __future__ import annotations

import json
import os
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from .service import RouteService


class ApiHandler(BaseHTTPRequestHandler):
    """Adaptador HTTP del contrato del motor de rutas."""

    service = RouteService()
    api_key = os.environ.get("MANTA_API_KEY")

    def _send(self, status: int, payload: dict) -> None:
        # Todas las respuestas usan JSON para que el simulador pueda consumirlas.
        body = json.dumps(payload, ensure_ascii=False, indent=2).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        origin = os.environ.get("MANTA_CORS_ORIGIN", "*")
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Headers", "Content-Type, x-api-key")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Vary", "Origin")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", os.environ.get("MANTA_CORS_ORIGIN", "*"))
        self.send_header("Access-Control-Allow-Headers", "Content-Type, x-api-key")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    def _authorized(self) -> bool:
        # La clave se configura por entorno y nunca se guarda en el código.
        if not self.api_key or self.headers.get("x-api-key") != self.api_key:
            self._send(401, {"error": "API key inválida o ausente"})
            return False
        return True

    def do_GET(self) -> None:
        if self.path == "/salud":
            self._send(200, {"estado": "ok", "turno": self.service.world.turn})
            return
        if self.path == "/":
            # La raíz sirve como guía cuando se abre el servidor desde un navegador.
            self._send(
                200,
                {
                    "servicio": "Mordida Manta",
                    "estado": "activo",
                    "endpoints": {
                        "estado": "GET /estado (requiere x-api-key)",
                        "paso": "POST /paso (requiere x-api-key)",
                        "simularTurno": "POST /simular-turno (requiere x-api-key)",
                        "escenario": "POST /escenario (ronda1, ronda2 o ronda3)",
                        "moverSobreviviente": "POST /mover-sobreviviente (requiere x-api-key)",
                        "despacharVehiculo": "POST /despachar-vehiculo (requiere x-api-key)",
                        "mapa": "GET /mapa",
                        "ruta": "GET /ruta/{sobrevivienteId} (requiere x-api-key)",
                        "salud": "GET /salud",
                    },
                },
            )
            return
        if self.path == "/mapa":
            self._send(200, self.service.graph.as_dict())
            return
        match = re.fullmatch(r"/ruta/([^/]+)", self.path)
        if match:
            if not self._authorized():
                return
            route = self.service.route_details(match.group(1))
            self._send(200 if route else 404, route or {"error": "Ruta segura no encontrada"})
            return
        if self.path != "/estado":
            self._send(404, {"error": "Ruta no encontrada"})
            return
        if self._authorized():
            self._send(200, self.service.state())

    def do_POST(self) -> None:
        if self.path == "/despachar-vehiculo":
            if not self._authorized():
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                data = json.loads(self.rfile.read(length) or b"{}")
                vehicle_id = data["vehiculoId"]
                survivor_id = data["sobrevivienteId"]
                if not isinstance(vehicle_id, str) or not isinstance(survivor_id, str):
                    raise ValueError("Identificadores invÃ¡lidos")
            except (KeyError, TypeError, ValueError, json.JSONDecodeError):
                self._send(400, {"error": "Despacho invÃ¡lido"})
                return
            dispatched = self.service.dispatch_vehicle(vehicle_id, survivor_id)
            self._send(200 if dispatched else 409, {"despachado": dispatched})
            return
        if self.path == "/mover-sobreviviente":
            if not self._authorized():
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                data = json.loads(self.rfile.read(length) or b"{}")
                survivor_id = data["sobrevivienteId"]
                target = data["nodoDestino"]
                if not isinstance(survivor_id, str) or not isinstance(target, str):
                    raise ValueError("Identificadores inválidos")
            except (KeyError, TypeError, ValueError, json.JSONDecodeError):
                self._send(400, {"error": "Movimiento inválido"})
                return
            moved = self.service.move_survivor(survivor_id, target)
            self._send(
                200 if moved else 409,
                {"movido": moved, "nodo": target if moved else None},
            )
            return
        if self.path == "/escenario":
            if not self._authorized():
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                data = json.loads(self.rfile.read(length) or b"{}")
                scenario = data["escenario"]
                self.service.load_scenario(scenario)
            except (KeyError, TypeError, ValueError, json.JSONDecodeError):
                self._send(400, {"error": "Escenario inválido"})
                return
            self._send(200, {"escenario": scenario, "turno": 0})
            return
        if self.path == "/simular-turno":
            if not self._authorized():
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                data = json.loads(self.rfile.read(length) or b"{}")
                edge = data.get("aristaBloqueada")
                blocked_edge = tuple(edge) if edge else None
                if blocked_edge and len(blocked_edge) != 2:
                    raise ValueError("aristaBloqueada debe tener dos nodos")
            except (TypeError, ValueError, json.JSONDecodeError):
                self._send(400, {"error": "Evento de turno inválido"})
                return
            turn = self.service.simulate_turn(blocked_edge)
            self._send(200, {"turno": turn})
            return
        if self.path != "/paso":
            self._send(404, {"error": "Ruta no encontrada"})
            return
        if not self._authorized():
            return
        try:
            # Validamos el contrato antes de llamar al motor de rutas.
            length = int(self.headers.get("Content-Length", "0"))
            data = json.loads(self.rfile.read(length))
            survivor_id = data["sobrevivienteId"]
            node = data["nodoActual"]
            turn = int(data["turno"])
            if not isinstance(survivor_id, str) or not isinstance(node, str):
                raise ValueError("sobrevivienteId y nodoActual deben ser texto")
        except (KeyError, TypeError, ValueError, json.JSONDecodeError):
            self._send(400, {"error": "JSON inválido o incompleto"})
            return
        next_node = self.service.next_step(survivor_id, node, turn)
        self._send(200, {"siguienteNodo": next_node})

    def log_message(self, format: str, *args: object) -> None:
        return


def run() -> None:
    """Inicia el servidor local; AWS podrá reemplazar este adaptador después."""
    if not os.environ.get("MANTA_API_KEY"):
        raise RuntimeError("Defina MANTA_API_KEY antes de iniciar el servidor")
    port = int(os.environ.get("PORT", "8080"))
    server = ThreadingHTTPServer(("0.0.0.0", port), ApiHandler)
    ApiHandler.service.start_turn_loop()
    print(f"Mordida Manta escuchando en http://localhost:{port}")
    try:
        server.serve_forever()
    finally:
        ApiHandler.service.stop_turn_loop()


if __name__ == "__main__":
    run()
