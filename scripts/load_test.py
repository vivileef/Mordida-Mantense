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
    import threading
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_port}/paso"
    latencies: list[float] = []
    successes = errors = 0

    def call(index: int) -> tuple[float, bool]:
        body = json.dumps({"sobrevivienteId": f"S-{index % 200 + 1:04d}", "nodoActual": "N-0013", "turno": 0}).encode()
        request = Request(url, body, {"Content-Type": "application/json", "x-api-key": key}, method="POST")
        started = time.perf_counter()
        try:
            with urlopen(request, timeout=10) as response:
                payload = json.loads(response.read())
                return (time.perf_counter() - started, response.status == 200 and set(payload) == {"siguienteNodo"})
        except (HTTPError, URLError, TimeoutError, ValueError):
            return (time.perf_counter() - started, False)

    try:
        workers = max(1, int(os.environ.get("MANTA_LOAD_WORKERS", "8")))
        # Calienta las cuatro clases de refugio con el mismo origen del ensayo;
        # el tiempo frío se informa aparte y no se mezcla con p95 sostenido.
        warmup_ms = [call(i)[0] * 1000 for i in range(4)]
        with ThreadPoolExecutor(max_workers=workers) as pool:
            for future in as_completed([pool.submit(call, i) for i in range(200)]):
                elapsed, ok = future.result()
                latencies.append(elapsed * 1000)
                successes += int(ok)
                errors += int(not ok)
    finally:
        server.shutdown()
        server.server_close()
    ordered = sorted(latencies)
    p95 = ordered[max(0, int(0.95 * len(ordered)) - 1)] if ordered else 0
    print(json.dumps({"solicitudes": len(latencies), "concurrencia": workers,
                      "warmup_no_contado": 4, "warmup_max_ms": round(max(warmup_ms), 3),
                      "exitos": successes, "errores": errors,
                      "latencia_promedio_ms": round(statistics.mean(latencies), 3) if latencies else None,
                      "p95_ms": round(p95, 3), "maxima_ms": round(max(latencies), 3) if latencies else None}, indent=2))


if __name__ == "__main__":
    main()
