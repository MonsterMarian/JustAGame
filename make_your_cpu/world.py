"""Generování světa, terénu a ložisek nerostných surovin s autentickou reálnou geografií Země."""
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

def is_earth_landmass(lat: float, lon: float) -> bool:
    """Zjišťuje, zda dané zeměpisné souřadnice leží na pevnině planety Země."""
    # 1. Oceány a moře
    # Středozemní moře
    if 30.0 <= lat <= 44.5 and -5.5 <= lon <= 36.0:
        # Apeninský a Balkánský poloostrov, Řecko
        if 36.5 <= lat <= 46.0 and 8.0 <= lon <= 18.5 and not (38.0 <= lat <= 42.0 and 12.5 <= lon <= 17.5):
            pass
        elif 35.0 <= lat <= 41.0 and 20.0 <= lon <= 26.5:
            pass
        else:
            return False

    # Baltské moře
    if 54.0 <= lat <= 66.0 and 10.0 <= lon <= 30.0:
        if not (56.0 <= lat <= 65.0 and 11.5 <= lon <= 18.0) and not (53.5 <= lat <= 59.0 and 21.0 <= lon <= 28.0):
            return False

    # Černé moře
    if 40.5 <= lat <= 47.0 and 27.5 <= lon <= 41.5:
        return False

    # Rudé moře
    if 12.0 <= lat <= 30.0 and 32.0 <= lon <= 43.5 and (lat - 12.0) * 0.6 < (lon - 32.0) < (lat - 12.0) * 0.6 + 6.0:
        return False

    # Mexický záliv
    if 18.0 <= lat <= 30.5 and -98.0 <= lon <= -81.0:
        return False

    # Hudsonův záliv
    if 51.0 <= lat <= 65.0 and -95.0 <= lon <= -78.0:
        return False

    # 2. Kontinenty
    # Evropa a Asie (Euroasie)
    if 35.0 <= lat <= 75.0 and -10.0 <= lon <= 180.0:
        return True

    # Britské ostrovy
    if 50.0 <= lat <= 59.5 and -10.5 <= lon <= 2.0:
        return True

    # Indie a jižní Asie
    if 8.0 <= lat <= 35.0 and 68.0 <= lon <= 92.0:
        return True

    # Jihovýchodní Asie a Čína
    if 0.0 <= lat <= 40.0 and 95.0 <= lon <= 125.0:
        return True

    # Japonsko
    if 30.0 <= lat <= 46.0 and 128.0 <= lon <= 146.0:
        return True

    # Afrika
    if -35.0 <= lat <= 37.0 and -18.0 <= lon <= 52.0:
        if lat < 5.0 and lon < 8.0 and (lon - 8.0) < (lat - 5.0) * 1.5:  # Guinejský záliv
            return False
        return True

    # Severní Amerika (USA, Kanada, Mexiko, Aljaška)
    if 14.0 <= lat <= 72.0 and -168.0 <= lon <= -52.0:
        return True

    # Jižní Amerika
    if -56.0 <= lat <= 12.5 and -82.0 <= lon <= -34.0:
        return True

    # Austrálie
    if -44.0 <= lat <= -10.0 and 112.0 <= lon <= 154.0:
        return True

    # Nový Zéland
    if -47.5 <= lat <= -34.0 and 166.0 <= lon <= 179.0:
        return True

    # Indonésie a Filipíny
    if -11.0 <= lat <= 20.0 and 95.0 <= lon <= 142.0:
        return True

    # Grónsko
    if 60.0 <= lat <= 83.5 and -73.0 <= lon <= -12.0:
        return True

    return False

def get_earth_elevation(lat: float, lon: float) -> float:
    """Vrací nadmořskou výšku v metrech na základě pohoří a reliéfu."""
    # Alpy
    if 44.0 <= lat <= 48.0 and 5.0 <= lon <= 16.0:
        return 2200.0 + _fbm(lat * 5.0, lon * 5.0, 42) * 1800.0
    # Krkonoše a Krušné hory / Sudety (ČR)
    if 49.5 <= lat <= 51.0 and 12.0 <= lon <= 16.5:
        return 650.0 + _fbm(lat * 8.0, lon * 8.0, 77) * 800.0
    # Karpaty / Tatry
    if 47.0 <= lat <= 50.0 and 18.0 <= lon <= 26.0:
        return 1400.0 + _fbm(lat * 6.0, lon * 6.0, 55) * 1100.0
    # Himálaj a Tibetská náhorní plošina
    if 27.0 <= lat <= 38.0 and 74.0 <= lon <= 104.0:
        return 4500.0 + _fbm(lat * 3.0, lon * 3.0, 99) * 3500.0
    # Andy (Jižní Amerika)
    if -54.0 <= lat <= 10.0 and -78.0 <= lon <= -64.0:
        return 3200.0 + _fbm(lat * 2.0, lon * 4.0, 88) * 2800.0
    # Skalnaté hory (Rockies)
    if 32.0 <= lat <= 60.0 and -125.0 <= lon <= -104.0:
        return 2400.0 + _fbm(lat * 2.5, lon * 2.5, 33) * 1800.0
    # Ural
    if 50.0 <= lat <= 68.0 and 56.0 <= lon <= 64.0:
        return 1100.0 + _fbm(lat * 3.0, lon * 3.0, 66) * 700.0
    # Běžná kontinentální rovina / pahorkatina
    return 150.0 + _fbm(lat * 2.0, lon * 2.0, 11) * 300.0

def get_earth_biome(lat: float, lon: float) -> int:
    """Určuje typ terénu podle reálných biomů Země (pouště, hory, roviny, pobřeží)."""
    elev = get_earth_elevation(lat, lon)
    if elev > 1800.0:
        return T_ROCK

    # Pouště (Sahara, Arabský poloostrov, Gobi, Atacama, Outback)
    if 15.0 <= lat <= 32.0 and -15.0 <= lon <= 35.0:  # Sahara
        return T_DRY
    if 14.0 <= lat <= 32.0 and 35.0 <= lon <= 58.0:  # Arabská poušť
        return T_DRY
    if 39.0 <= lat <= 48.0 and 95.0 <= lon <= 116.0:  # Gobi
        return T_DRY
    if -28.0 <= lat <= -18.0 and -71.5 <= lon <= -67.0:  # Atacama
        return T_DRY
    if -32.0 <= lat <= -18.0 and 118.0 <= lon <= 142.0:  # Outback
        return T_DRY

    return T_GRASS

class World:
    """Svět hry s autentickým terénem planety Země a reálnými ložisky."""

    def __init__(
        self,
        seed: int = 1337,
        real_deposits: Optional[List[dict]] = None,
        center_lat: float = 50.0,
        center_lon: float = 14.5,
        scale_km_per_tile: float = 1.0,
        use_earth_geography: bool = True
    ):
        self.seed = seed
        self.center_lat = center_lat
        self.center_lon = center_lon
        self.scale_km = scale_km_per_tile
        self.use_earth = use_earth_geography

        self._chunks: Dict[Tuple[int, int], Tuple[bytearray, bytearray]] = {}
        self.real_deposits = real_deposits or []
        self._custom_ores: Dict[Tuple[int, int], int] = {}
        self._deposit_meta: Dict[Tuple[int, int], dict] = {}

        for dep in self.real_deposits:
            oi = dep.get("ore_index", 1)
            cx = dep.get("x", 0)
            cy = dep.get("y", 0)
            rad = dep.get("radius", 8)
            for dy in range(-rad, rad + 1):
                for dx in range(-rad, rad + 1):
                    if dx * dx + dy * dy <= rad * rad:
                        pos = (cx + dx, cy + dy)
                        self._custom_ores[pos] = oi
                        self._deposit_meta[pos] = dep

    def grid_to_geo(self, x: float, y: float) -> Tuple[float, float]:
        """Převede souřadnice herní mřížky (x, y) zpět na reálné (lat, lon)."""
        dy_km = -y * self.scale_km
        dx_km = x * self.scale_km
        lat = self.center_lat + (dy_km / 111.0)
        cos_lat = max(0.01, math.cos(math.radians(self.center_lat)))
        lon = self.center_lon + (dx_km / (111.0 * cos_lat))
        return lat, lon

    def height(self, x: float, y: float) -> float:
        if not self.use_earth:
            d = math.hypot(x, y)
            if d < 10:
                return 0.0
            h = (_fbm(x / 140.0, y / 140.0, self.seed + 200) - 0.45) * 22.0
            k = 0.0 if d < 40 else ((d - 40.0) / 40.0 if d < 80 else 1.0)
            return max(0.0, h * k)

        # Pro okolí startu zajistit rovnou plochu
        d = math.hypot(x, y)
        if d < 20:
            return 0.0

        lat, lon = self.grid_to_geo(x, y)
        if not is_earth_landmass(lat, lon):
            return 0.0
        elev_m = get_earth_elevation(lat, lon)
        return min(35.0, (elev_m / 100.0))

    def sample(self, x: int, y: int) -> int:
        # Priorita 1: Ložiska nerostných surovin
        ore_idx = self._custom_ores.get((x, y), 0)

        # Priorita 2: Kolem startovní základny (x=0, y=0) je vždy čistá souš pro továrnu
        dist = math.hypot(x, y)
        if dist < 22:
            # Startovní ložiska přímo u základny, aby šla hra hned hrát
            for starter in STARTERS:
                o, sx, sy, r = starter
                if math.hypot(x - sx, y - sy) <= r:
                    return T_GRASS | (o << 3)
            return T_GRASS | (ore_idx << 3)

        if self.use_earth:
            lat, lon = self.grid_to_geo(x, y)
            # Zjisti, zda je bod na souši planety Země
            if not is_earth_landmass(lat, lon):
                # Voda / oceán
                return T_WATER
            # Biom na pevnině
            biome = get_earth_biome(lat, lon)
            return biome | (ore_idx << 3)

        # Alternativní procedurální terén
        e = _fbm(x / 170.0, y / 170.0, self.seed)
        m = _fbm(x / 130.0, y / 130.0, self.seed + 100)
        t = (
            T_WATER if e < 0.36
            else T_SAND if e < 0.39
            else T_ROCK if e > 0.66
            else T_SAND if m < 0.36
            else T_DRY if m < 0.52
            else T_GRASS
        )
        return t | (ore_idx << 3)

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
