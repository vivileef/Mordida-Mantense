from __future__ import annotations

from threading import Event, Thread, current_thread
from typing import Callable


class TurnLoop:
    """Avanza el mundo periódicamente sin bloquear las peticiones HTTP."""

    def __init__(self, advance_turn: Callable[[], int], interval: float = 2.0) -> None:
        if interval <= 0:
            raise ValueError("El intervalo debe ser mayor que cero")
        self._advance_turn = advance_turn
        self._interval = interval
        self._stop_event = Event()
        self._thread: Thread | None = None

    def start(self) -> None:
        """Inicia un único hilo daemon para el reloj del apocalipsis."""
        if self.is_running():
            return
        self._stop_event.clear()
        self._thread = Thread(target=self._run, name="mordida-turn-loop", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        """Solicita una parada y espera a que termine el hilo."""
        self._stop_event.set()
        if self._thread and self._thread is not current_thread():
            self._thread.join(timeout=self._interval + 1)
        self._thread = None

    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def _run(self) -> None:
        while not self._stop_event.wait(self._interval):
            self._advance_turn()
