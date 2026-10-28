from __future__ import annotations

import argparse
import json
import os
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urljoin, urlparse
from urllib.request import Request, urlopen
from pathlib import Path
from typing import Any

try:
    import networkx as nx
    import osmnx as ox
except ModuleNotFoundError as exc:  # pragma: no cover - kept for explicit installation feedback.
    raise SystemExit(
        "Faltan dependencias del grafo. Ejecuta: python -m venv .venv; "
        ".\\.venv\\Scripts\\Activate.ps1; python -m pip install -r tools\\grafo-manta\\requirements.txt"
    ) from exc


DEFAULT_PLACE = "Manta, Manabí, Ecuador"
DEFAULT_RETRIES = 3
DEFAULT_RETRY_DELAY = 5.0
OVERPASS_ENVIRONMENT_VARIABLE = "MANTA_OVERPASS_URL"


def parse_bbox(value: str | None) -> tuple[float, float, float, float] | None:
    if value is None:
        return None
    items = [float(part.strip()) for part in value.split(",") if part.strip()]
    if len(items) != 4:
        raise ValueError(
            "El parámetro --bbox debe tener cuatro valores: minx,miny,maxx,maxy"
        )
    return (items[0], items[1], items[2], items[3])


def make_node_id(index: int) -> str:
    return f"N-{index:04d}"


def tag_value(value: Any, default: str) -> str:
    if isinstance(value, (list, tuple)):
        return ", ".join(str(item) for item in value)
    return str(value) if value not in (None, "") else default


def check_overpass_endpoint(overpass_url: str, timeout: float = 15.0) -> tuple[bool, str]:
    """Comprueba el intérprete Overpass con una consulta mínima y acotada."""
    parsed = urlparse(overpass_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return False, "La URL de Overpass debe usar http(s) y contener un host válido."

    interpreter_url = urljoin(overpass_url.rstrip("/") + "/", "interpreter")
    query = "[out:json][timeout:5];node(0,0,0.0001,0.0001);out count;"
    request = Request(
        interpreter_url,
        data=urlencode({"data": query}).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Mordida-Mantense-grafo/1.0",
        },
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            if not 200 <= response.status < 300:
                return False, f"intérprete respondió HTTP {response.status}"
            try:
                result = json.loads(response.read().decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                return False, f"intérprete devolvió una respuesta no JSON ({exc})"
            if not isinstance(result, dict) or not isinstance(result.get("elements"), list):
                return False, "intérprete devolvió un JSON sin la estructura esperada."
            return True, f"intérprete disponible (HTTP {response.status})"
    except HTTPError as exc:
        return False, f"intérprete respondió HTTP {exc.code}"
    except (TimeoutError, URLError, OSError) as exc:
        return False, f"intérprete no responde dentro del timeout ({exc})"


def is_transient_overpass_error(error: Exception) -> bool:
    status_code = getattr(getattr(error, "response", None), "status_code", None)
    if status_code in {408, 429, 500, 502, 503, 504}:
        return True
    message = str(error).lower()
    return any(
        marker in message
        for marker in (
            "timeout",
            "timed out",
            "temporarily unavailable",
            "queue is full",
            "at capacity",
            "502",
            "503",
            "504",
            "429",
        )
    )


def export_json(graph: Any, output_path: Path) -> dict[str, Any]:
    node_map: dict[int, str] = {}
    ordered_nodes = sorted(
        graph.nodes(data=True),
        key=lambda item: (float(item[1]["y"]), float(item[1]["x"]), int(item[0])),
    )
    for index, (osmid, _) in enumerate(ordered_nodes, start=1):
        node_map[int(osmid)] = make_node_id(index)

    nodes_payload = []
    for osmid, data in ordered_nodes:
        nodes_payload.append(
            {
                "id": node_map[int(osmid)],
                "lat": float(data["y"]),
                "lng": float(data["x"]),
            }
        )

    edges_payload = []
    for source_osmid, target_osmid, data in graph.edges(data=True):
        if source_osmid not in node_map or target_osmid not in node_map:
            continue
        source_id = node_map[int(source_osmid)]
        target_id = node_map[int(target_osmid)]
        distance = float(data.get("length", 0.0))
        if distance <= 0:
            distance = 0.0
        way_type = tag_value(data.get("highway"), "unknown")
        geometry = data.get("geometry")
        geometry_coordinates = (
            [[round(float(x), 7), round(float(y), 7)] for x, y in geometry.coords]
            if geometry is not None
            else [
                [round(float(graph.nodes[source_osmid]["x"]), 7), round(float(graph.nodes[source_osmid]["y"]), 7)],
                [round(float(graph.nodes[target_osmid]["x"]), 7), round(float(graph.nodes[target_osmid]["y"]), 7)],
            ]
        )
        oneway = bool(data.get("oneway", False))
        if oneway:
            direction = "sentido_unico"
        else:
            direction = "bidireccional"
        edges_payload.append(
            {
                "origen": source_id,
                "destino": target_id,
                "distancia_m": round(distance, 2),
                "tipo": way_type,
                "nombre": tag_value(data.get("name"), "calle sin nombre"),
                "sentido": direction,
                "geometry": {
                    "type": "LineString",
                    "coordinates": geometry_coordinates,
                },
            }
        )

    payload = {"nodos": nodes_payload, "calles": edges_payload}
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload


def validate_route_json(payload: dict[str, Any]) -> tuple[bool, str, list[str]]:
    nodes = payload.get("nodos", [])
    edges = payload.get("calles", [])
    if not nodes or not edges:
        return False, "El grafo exportado no tiene nodos ni calles válidas.", []

    node_lookup = {item["id"]: (float(item["lat"]), float(item["lng"])) for item in nodes}
    adjacency: dict[str, set[str]] = {item["id"]: set() for item in nodes}
    for edge in edges:
        source = edge["origen"]
        target = edge["destino"]
        adjacency.setdefault(source, set()).add(target)
        adjacency.setdefault(target, set()).add(source)

    start = next(iter(node_lookup))
    goal = next(iter(reversed(list(node_lookup.keys()))))
    if start == goal:
        return True, "El grafo tiene un único nodo; la validación de ruta no aporta información útil.", [start]

    graph = nx.Graph()
    graph.add_nodes_from(node_lookup.keys())
    for edge in edges:
        graph.add_edge(edge["origen"], edge["destino"], weight=float(edge.get("distancia_m", 0.0)))

    try:
        shortest = nx.shortest_path(graph, source=start, target=goal, weight="weight")
    except nx.NetworkXNoPath as exc:
        return False, f"No existe ruta válida entre {start} y {goal}.", []

    for previous, current in zip(shortest, shortest[1:]):
        if current not in adjacency.get(previous, set()):
            return False, f"El tramo {previous} -> {current} no está conectado en el grafo exportado.", shortest
    return True, f"Ruta válida con {len(shortest) - 1} tramo(s) comprobados.", shortest


def download_manta_graph(
    place: str,
    bbox: tuple[float, float, float, float] | None,
    output_dir: Path,
    overpass_url: str | None = None,
    retries: int = DEFAULT_RETRIES,
    retry_delay: float = DEFAULT_RETRY_DELAY,
) -> tuple[Path, Path, dict[str, Any]]:
    output_dir.mkdir(parents=True, exist_ok=True)
    graphml_path = output_dir / "manta.graphml"
    json_path = output_dir / "manta.json"

    if not hasattr(ox.settings, "overpass_url"):
        raise RuntimeError("La versión instalada de OSMnx no expone settings.overpass_url.")
    selected_overpass_url = overpass_url or ox.settings.overpass_url
    ox.settings.overpass_url = selected_overpass_url
    ox.settings.requests_timeout = max(1, int(ox.settings.requests_timeout))

    attempt = 0
    while True:
        try:
            if bbox is not None:
                print(f"Descargando red vial desde bbox: {bbox}")
                west, south, east, north = bbox
                graph = ox.graph_from_bbox(
                    bbox=(west, south, east, north),
                    network_type="drive",
                    simplify=True,
                )
            else:
                print(f"Descargando red vial desde: {place}")
                graph = ox.graph_from_place(place, network_type="drive", simplify=True)
            break
        except Exception as exc:
            if attempt >= retries or not is_transient_overpass_error(exc):
                raise
            attempt += 1
            wait_seconds = retry_delay * (2 ** (attempt - 1))
            print(
                f"Consulta Overpass transitoria ({attempt}/{retries}). "
                f"Reintentando en {wait_seconds:g} s: {exc}",
                file=sys.stderr,
            )
            time.sleep(wait_seconds)

    try:
        ox.save_graphml(graph, str(graphml_path))
    except Exception as exc:  # pragma: no cover - depends on network and OSM availability.
        raise RuntimeError(f"No fue posible guardar manta.graphml: {exc}") from exc

    payload = export_json(graph, json_path)
    nodes_count = len(payload["nodos"])
    edges_count = len(payload["calles"])
    print(f"Nodos descargados: {nodes_count}")
    print(f"Aristas descargadas: {edges_count}")
    return graphml_path, json_path, payload


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Descarga y exporta el grafo real de Manta desde OpenStreetMap.")
    parser.add_argument("--place", default=DEFAULT_PLACE, help="Consulta geográfica de OSM a descargar.")
    parser.add_argument("--bbox", default=None, help="Límite opcional: west,south,east,north")
    parser.add_argument("--output-dir", default=str(Path(__file__).resolve().parent), help="Directorio donde guardar manta.graphml y manta.json.")
    parser.add_argument("--validate-route", action="store_true", help="Ejecuta una prueba de ruta sobre el JSON exportado.")
    parser.add_argument("--dry-run", action="store_true", help="No descarga el grafo; valida la configuración local y el contrato de exportación.")
    parser.add_argument(
        "--overpass-url",
        default=os.environ.get(OVERPASS_ENVIRONMENT_VARIABLE),
        help=f"Endpoint base compatible con OSMnx (también {OVERPASS_ENVIRONMENT_VARIABLE}).",
    )
    parser.add_argument("--retries", type=int, default=DEFAULT_RETRIES, help="Reintentos máximos para saturación o timeout (0-5).")
    parser.add_argument("--retry-delay", type=float, default=DEFAULT_RETRY_DELAY, help="Espera inicial en segundos; se duplica en cada reintento.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    output_dir = Path(args.output_dir).resolve()

    try:
        bbox = parse_bbox(args.bbox)
    except ValueError as exc:
        print(f"Error de argumentos: {exc}", file=sys.stderr)
        return 2

    if args.retries < 0 or args.retries > 5:
        print("--retries debe estar entre 0 y 5.", file=sys.stderr)
        return 2
    if args.retry_delay < 0:
        print("--retry-delay no puede ser negativo.", file=sys.stderr)
        return 2

    if args.dry_run:
        print("Modo dry-run activo: no se descarga ninguna red vial real.")
        print(f"Lugar configurado: {args.place}")
        print(f"BBox: {bbox}")
        print(f"Endpoint Overpass: {args.overpass_url or 'configuración por defecto de OSMnx'}")
        return 0

    selected_overpass_url = args.overpass_url or ox.settings.overpass_url
    available, status = check_overpass_endpoint(selected_overpass_url)
    if not available:
        print(
            f"El endpoint Overpass no se usará porque no superó la comprobación: {status}",
            file=sys.stderr,
        )
        return 1
    print(f"Endpoint Overpass comprobado: {selected_overpass_url} ({status})")

    try:
        _, _, payload = download_manta_graph(
            args.place,
            bbox,
            output_dir,
            overpass_url=selected_overpass_url,
            retries=args.retries,
            retry_delay=args.retry_delay,
        )
    except Exception as exc:
        print(f"La descarga no pudo completarse: {exc}", file=sys.stderr)
        print("No se puede afirmar que el grafo real está disponible si la consulta falló o la conexión está bloqueada.", file=sys.stderr)
        return 1

    if args.validate_route:
        ok, summary, route = validate_route_json(payload)
        print(summary)
        if ok:
            print(f"Ruta validada: {' -> '.join(route)}")
            return 0
        print("La validación de ruta no fue satisfactoria.", file=sys.stderr)
        return 1

    print("Grafo exportado correctamente.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
