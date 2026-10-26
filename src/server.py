from __future__ import annotations

import json
import os
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
        self.end_headers()
        self.wfile.write(body)

    def _authorized(self) -> bool:
        # La clave se configura por entorno y nunca se guarda en el código.
        if not self.api_key or self.headers.get("x-api-key") != self.api_key:
            self._send(401, {"error": "API key inválida o ausente"})
            return False
        return True

    def do_GET(self) -> None:
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
                    },
                },
            )
            return
        if self.path != "/estado":
            self._send(404, {"error": "Ruta no encontrada"})
            return
        if self._authorized():
            self._send(200, self.service.state())

    def do_POST(self) -> None:
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
    print(f"Mordida Manta escuchando en http://localhost:{port}")
    server.serve_forever()


if __name__ == "__main__":
    run()
