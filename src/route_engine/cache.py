from __future__ import annotations

from collections import OrderedDict
from threading import RLock
from typing import Hashable, TypeVar

T = TypeVar("T")


class RouteCache:
    """LRU de rutas; la huella de peligros y cierres vive en cada clave."""

    def __init__(self, max_size: int = 2048) -> None:
        self.max_size = max(1, max_size)
        self._items: OrderedDict[Hashable, object] = OrderedDict()
        self._lock = RLock()

    def get(self, key: Hashable):
        with self._lock:
            value = self._items.get(key)
            if value is not None:
                self._items.move_to_end(key)
            return value

    def put(self, key: Hashable, value: T) -> T:
        with self._lock:
            self._items[key] = value
            self._items.move_to_end(key)
            while len(self._items) > self.max_size:
                self._items.popitem(last=False)
        return value

    def clear(self) -> None:
        with self._lock:
            self._items.clear()
