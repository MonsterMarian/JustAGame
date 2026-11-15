"""Generování světa, terénu a ložisek nerostných surovin (procedurální i reálná geodata)."""
import math
from typing import Dict, Tuple, List, Optional
from .catalog import ORES, STARTERS

CHUNK = 32
T_WATER = 0
T_SAND = 1
T_GRASS = 2
T_DRY = 3
T_ROCK = 4
LEVELS = 6
LEVEL_M = 50
SURF_T = 30
DEEP_T = 150

def _hash(x: int, y: int, s: int) -> float:
    h = ((x * 374761393) + (y * 668265263) + (s * 1442695041)) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFFFFFF) / 4294967296.0

def _smooth(t: float) -> float:
    return t * t * (3.0 - 2.0 * t)

def _noise(x: float, y: float, s: int) -> float:
    xi = math.floor(x)
    yi = math.floor(y)
    fx = _smooth(x - xi)
    fy = _smooth(y - yi)
    a = _hash(xi, yi, s)
    b = _hash(xi + 1, yi, s)
    c = _hash(xi, yi + 1, s)
    d = _hash(xi + 1, yi + 1, s)
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy

def _fbm(x: float, y: float, s: int) -> float:
    return _noise(x, y, s) * 0.6 + _noise(x * 2.1, y * 2.1, s + 7) * 0.3 + _noise(x * 4.3, y * 4.3, s + 13) * 0.1

class World:
    """Svět hry s podporou procedurálního terénu i importovaných reálných ložisek."""

    def __init__(self, seed: int = 1337, real_deposits: Optional[List[dict]] = None):
        self.seed = seed
        self._chunks: Dict[Tuple[int, int], Tuple[bytearray, bytearray]] = {}
        self.real_deposits = real_deposits or []
        self._custom_ores: Dict[Tuple[int, int], int] = {}
        if real_deposits:
            for dep in real_deposits:
                oi = dep.get("ore_index", 1)
                cx = dep.get("x", 0)
                cy = dep.get("y", 0)
                rad = dep.get("radius", 6)
                for dy in range(-rad, rad + 1):
                    for dx in range(-rad, rad + 1):
                        if dx * dx + dy * dy <= rad * rad:
                            self._custom_ores[(cx + dx, cy + dy)] = oi

    def height(self, x: float, y: float) -> float:
        d = math.hypot(x, y)
        if d < 10:
            return 0.0
        h = (_fbm(x / 140.0, y / 140.0, self.seed + 200) - 0.45) * 22.0
        k = 0.0 if d < 40 else ((d - 40.0) / 40.0 if d < 80 else 1.0)
        return max(0.0, h * k)

    def sample(self, x: int, y: int) -> int:
        if (x, y) in self._custom_ores:
            return T_GRASS | (self._custom_ores[(x, y)] << 3)

        dist = math.hypot(x, y)
        e = _fbm(x / 170.0, y / 170.0, self.seed)
        k = 1.0 if dist < 60 else ((100.0 - dist) / 40.0 if dist < 100 else 0.0)
        if k > 0 and e < 0.42:
            e += (0.42 - e) * k
        m = _fbm(x / 130.0, y / 130.0, self.seed + 100)
        t = (
            T_WATER if e < 0.36
            else T_SAND if e < 0.39
            else T_ROCK if e > 0.66
            else T_SAND if m < 0.36
            else T_DRY if m < 0.52
            else T_GRASS
        )
        if t == T_WATER or dist < 14:
            return t

        for starter in STARTERS:
            o, sx, sy, r = starter
            if math.hypot(x - sx, y - sy) < r - 2 + 3 * _hash(x, y, self.seed + 5):
                return t | (o << 3)

        for o in range(1, len(ORES)):
            d_ore = ORES[o]
            if d_ore and dist >= d_ore["far"]:
                scale = d_ore["scale"]
                thr = d_ore["thr"]
                if _fbm(x / scale, y / scale, self.seed + 1000 + o * 37) > thr:
                    return t | (o << 3)

        return t

    def get_chunk(self, cx: int, cy: int) -> Tuple[bytearray, bytearray]:
        k = (cx, cy)
        if k in self._chunks:
            return self._chunks[k]
        terrain = bytearray(CHUNK * CHUNK)
        ore = bytearray(CHUNK * CHUNK)
        for j in range(CHUNK):
            for i in range(CHUNK):
                v = self.sample(cx * CHUNK + i, cy * CHUNK + j)
                idx = j * CHUNK + i
                terrain[idx] = v & 7
                ore[idx] = v >> 3
        self._chunks[k] = (terrain, ore)
        return self._chunks[k]

    def terrain(self, x: int, y: int) -> int:
        cx, cy = x // CHUNK, y // CHUNK
        i, j = x % CHUNK, y % CHUNK
        t_arr, _ = self.get_chunk(cx, cy)
        return t_arr[j * CHUNK + i]

    def ore(self, x: int, y: int) -> int:
        cx, cy = x // CHUNK, y // CHUNK
        i, j = x % CHUNK, y % CHUNK
        _, o_arr = self.get_chunk(cx, cy)
        return o_arr[j * CHUNK + i]

    def rnd(self, x: int, y: int, seed: int = 0) -> float:
        return _hash(x, y, self.seed + seed)
