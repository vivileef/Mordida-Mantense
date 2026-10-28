"""Ensayo local reproducible: 200 solicitudes HTTP reales a POST /paso."""
from __future__ import annotations

import json
import os
import sys
import statistics
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from http.server import ThreadingHTTPServer
from threading import Event, Lock, local
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.server import ApiHandler
from src.service import RouteService


def main() -> None:
    key = os.environ.get("MANTA_API_KEY", "load-test-local-key")
    ApiHandler.api_key = key
    ApiHandler.service = RouteService(scenario="ronda3")
    server = ThreadingHTTPServer(("127.0.0.1", 0), ApiHandler)
    server.daemon_threads = True
    # Instrumentación temporal del ensayo: mide desde que el socket llega al
    # servidor, entrada al handler, tiempo previo a next_step y el motor mismo.
    diagnostics: dict[str, dict] = {}
    diagnostic_events: dict[str, Event] = {}
    diagnostics_lock = Lock()
    request_context = local()
    accepted_sockets: dict[int, float] = {}
    original_process_request = server.process_request
    original_process_request_thread = server.process_request_thread
    original_do_post = ApiHandler.do_POST
    original_next_step = RouteService.next_step

    def instrumented_process_request(request, client_address) -> None:
        with diagnostics_lock:
            accepted_sockets[request.fileno()] = time.perf_counter()
        original_process_request(request, client_address)

    def instrumented_process_request_thread(request, client_address) -> None:
        with diagnostics_lock:
            request_context.accepted_at = accepted_sockets.pop(request.fileno(), None)
        try:
            original_process_request_thread(request, client_address)
        finally:
            if hasattr(request_context, "accepted_at"):
                del request_context.accepted_at

    def instrumented_next_step(service, survivor_id: str, node: str, turn: int) -> str:
        request_id = getattr(request_context, "request_id", None)
        started = time.perf_counter()
        if request_id:
            with diagnostics_lock:
                diagnostics[request_id]["handler_a_next_step_ms"] = round(
                    (started - getattr(request_context, "handler_started", started)) * 1000, 3
                )
        try:
            return original_next_step(service, survivor_id, node, turn)
        finally:
            if request_id:
                elapsed = round((time.perf_counter() - started) * 1000, 3)
                with diagnostics_lock:
                    diagnostics[request_id]["next_step_ms"] = elapsed

    # El timestamp de entrada al handler permite separar parseo/autorización
    # previo al motor; no se modifica el handler ni el contrato HTTP.
    def instrumented_do_post(handler) -> None:
        request_id = handler.headers.get("X-Load-Test-Request-ID")
        handler_started = time.perf_counter()
        if request_id:
            request_context.request_id = request_id
            request_context.handler_started = handler_started
            with diagnostics_lock:
                diagnostics[request_id] = {
                    "servidor_aceptacion_a_handler_ms": round(
                        (handler_started - request_context.accepted_at) * 1000, 3
                    ) if getattr(request_context, "accepted_at", None) is not None else None,
                }
        try:
            original_do_post(handler)
        finally:
            if request_id:
                with diagnostics_lock:
                    diagnostics[request_id]["handler_total_ms"] = round(
                        (time.perf_counter() - handler_started) * 1000, 3
                    )
                for attribute in ("request_id", "handler_started"):
                    if hasattr(request_context, attribute):
                        delattr(request_context, attribute)
                diagnostic_events[request_id].set()

    server.process_request = instrumented_process_request
    server.process_request_thread = instrumented_process_request_thread
    ApiHandler.do_POST = instrumented_do_post
    RouteService.next_step = instrumented_next_step
    import threading
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_port}/paso"
    measurements: list[dict] = []

    def call(request_id: int, phase: str = "medida") -> dict:
        survivor_id = f"S-{(request_id - 1) % 200 + 1:04d}"
        diagnostic_id = f"{phase}-{request_id}"
        body = json.dumps({"sobrevivienteId": survivor_id, "nodoActual": "N-0013", "turno": 0}).encode()
        request = Request(url, body, {
            "Content-Type": "application/json",
            "x-api-key": key,
            "X-Load-Test-Request-ID": diagnostic_id,
        }, method="POST")
        completion = Event()
        with diagnostics_lock:
            diagnostic_events[diagnostic_id] = completion
        started = time.perf_counter()
        status_code = None
        error_type = None
        try:
            with urlopen(request, timeout=10) as response:
                status_code = response.status
                payload = json.loads(response.read())
                success = status_code == 200 and set(payload) == {"siguienteNodo"}
                if not success:
                    error_type = "respuesta_contrato_invalida"
        except HTTPError as exc:
            status_code = exc.code
            error_type = type(exc).__name__
        except (URLError, TimeoutError, ValueError) as exc:
            error_type = type(exc).__name__
        except Exception as exc:
            error_type = type(exc).__name__

        elapsed_ms = (time.perf_counter() - started) * 1000
        # El cliente puede recibir el cuerpo justo antes del finally del handler;
        # esperamos la telemetría después de cerrar el cronómetro HTTP.
        completion.wait(timeout=0.1)
        with diagnostics_lock:
            server_times = diagnostics.get(diagnostic_id, {}).copy()
        if "handler_total_ms" in server_times:
            server_times["latencia_fuera_handler_ms"] = round(
                max(0.0, elapsed_ms - server_times["handler_total_ms"]), 3
            )
        return {
            "id": request_id,
            "sobreviviente_id": survivor_id,
            "latencia_ms": round(elapsed_ms, 3),
            "codigo_http": status_code,
            "resultado": "exito" if error_type is None else "error",
            "error": error_type,
            **server_times,
        }

    try:
        workers = max(1, int(os.environ.get("MANTA_LOAD_WORKERS", "8")))
        # Calienta las cuatro clases de refugio con el mismo origen del ensayo;
        # el tiempo frío se informa aparte y no se mezcla con p95 sostenido.
        warmup_records = [call(i + 1, "calentamiento") for i in range(4)]
        warmup_ms = [record["latencia_ms"] for record in warmup_records]
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = [pool.submit(call, i + 1) for i in range(200)]
            for future in as_completed(futures):
                measurements.append(future.result())
    finally:
        server.shutdown()
        server.server_close()
        ApiHandler.do_POST = original_do_post
        RouteService.next_step = original_next_step
    measurements.sort(key=lambda item: item["id"])
    latencies = [item["latencia_ms"] for item in measurements]
    successes = sum(item["resultado"] == "exito" for item in measurements)
    errors = len(measurements) - successes
    ordered = sorted(latencies)
    p95 = ordered[max(0, int(0.95 * len(ordered)) - 1)] if ordered else 0
    slowest = sorted(measurements, key=lambda item: item["latencia_ms"], reverse=True)[:10]
    timing_fields = (
        "servidor_aceptacion_a_handler_ms",
        "handler_a_next_step_ms",
        "next_step_ms",
        "handler_total_ms",
    )
    server_timing_stats = {}
    for field in timing_fields:
        values = sorted(item[field] for item in measurements if field in item)
        server_timing_stats[field] = {
            "muestras": len(values),
            "p95_ms": round(values[max(0, int(0.95 * len(values)) - 1)], 3) if values else None,
            "maximo_ms": round(max(values), 3) if values else None,
        }
    print(json.dumps({
        "solicitudes": len(measurements),
        "concurrencia": workers,
        "warmup_no_contado": 4,
        "warmup_max_ms": round(max(warmup_ms), 3),
        "exitos": successes,
        "errores": errors,
        "latencia_promedio_ms": round(statistics.mean(latencies), 3) if latencies else None,
        "p95_ms": round(p95, 3),
        "maxima_ms": round(max(latencies), 3) if latencies else None,
        "tiempos_servidor": server_timing_stats,
        "solicitudes_mas_lentas": slowest,
        "mediciones": measurements,
    }, indent=2))


if __name__ == "__main__":
    main()
