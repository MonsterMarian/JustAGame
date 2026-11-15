"""Stahování a import reálných ložisek nerostů ze světa (USGS MRDS a reálná GIS data)."""
import json
import math
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple

try:
    import requests
except ImportError:
    requests = None

# Reálná světová ložiska s přesnými geografickými souřadnicemi a zásobami
FAMOUS_GLOBAL_MINES = [
    # Česká republika a střední Evropa (ideální pro regionální scénář)
    {"name": "Mostecká uhelná pánev", "lat": 50.518, "lon": 13.642, "ore": "coal", "reserves_t": 850000000, "radius": 14},
    {"name": "Sokolovská uhelná pánev", "lat": 50.183, "lon": 12.645, "ore": "coal", "reserves_t": 320000000, "radius": 10},
    {"name": "Cínovec (Zinnwald) Li-Sn ložisko", "lat": 50.732, "lon": 13.766, "ore": "ore_sn", "reserves_t": 120000000, "radius": 8},
    {"name": "Střeleč (Český ráj - sklářský křemen)", "lat": 50.505, "lon": 15.201, "ore": "quartz", "reserves_t": 450000000, "radius": 12},
    {"name": "Provodaín (Křemenné písky)", "lat": 50.622, "lon": 14.594, "ore": "quartz", "reserves_t": 180000000, "radius": 8},

    # Globální super-ložiska
    {"name": "Escondida (Chile - největší měď na světě)", "lat": -24.269, "lon": -69.068, "ore": "ore_cu", "reserves_t": 3200000000, "radius": 24},
    {"name": "Chuquicamata (Chile - obří povrchový lom mědi)", "lat": -22.316, "lon": -68.903, "ore": "ore_cu", "reserves_t": 1800000000, "radius": 20},
    {"name": "Pilbara - Mount Whaleback (Austrálie)", "lat": -23.364, "lon": 119.670, "ore": "quartz", "reserves_t": 2500000000, "radius": 26},
    {"name": "Hunter Valley (Austrálie - uhelný uzel)", "lat": -32.618, "lon": 151.173, "ore": "coal", "reserves_t": 1600000000, "radius": 22},
    {"name": "Powder River Basin (Wyoming USA - uhelný superlom)", "lat": 44.291, "lon": -105.498, "ore": "coal", "reserves_t": 2800000000, "radius": 25},
    {"name": "Bingham Canyon (Utah USA - Kennecott Copper)", "lat": 40.522, "lon": -112.151, "ore": "ore_cu", "reserves_t": 1900000000, "radius": 20},
    {"name": "Witwatersrand Basin (Jihoafrická republika - zlato)", "lat": -26.204, "lon": 28.047, "ore": "ore_au", "reserves_t": 40000000, "radius": 16},
    {"name": "Salar de Atacama (Chile - lithná a kamenná sůl)", "lat": -23.500, "lon": -68.333, "ore": "halite", "reserves_t": 800000000, "radius": 18},
    {"name": "Weipa Bauxite Mine (Austrálie - bauxit)", "lat": -12.646, "lon": 141.876, "ore": "bauxite", "reserves_t": 1200000000, "radius": 22},
    {"name": "Kupferschiefer (Polsko - Lubin/Polkowice měď)", "lat": 51.405, "lon": 16.201, "ore": "ore_cu", "reserves_t": 950000000, "radius": 18},
]

ORE_NAME_MAP = {
    "quartz": 1,
    "coal": 2,
    "ore_cu": 3,
    "bauxite": 4,
    "halite": 5,
    "fluorspar": 6,
    "ore_sn": 7,
    "ore_au": 8,
}

COMMODITY_TO_ORE = {
    "quartz": "quartz", "silica": "quartz", "sand": "quartz",
    "coal": "coal", "lignite": "coal", "anthracite": "coal",
    "copper": "ore_cu", "chalcopyrite": "ore_cu",
    "bauxite": "bauxite", "aluminum": "bauxite",
    "salt": "halite", "halite": "halite",
    "fluorite": "fluorspar", "fluorspar": "fluorspar",
    "tin": "ore_sn", "cassiterite": "ore_sn",
    "gold": "ore_au",
}

def geo_to_grid(lat: float, lon: float, center_lat: float, center_lon: float, scale_km_per_tile: float = 0.5) -> Tuple[int, int]:
    """Převede GPS zeměpisnou šířku a délku na mřížku dlaždic hry."""
    # 1 stupeň zeměpisné šířky ~ 111 km
    dy_km = (lat - center_lat) * 111.0
    dx_km = (lon - center_lon) * 111.0 * math.cos(math.radians(center_lat))
    x = int(round(dx_km / scale_km_per_tile))
    y = int(round(-dy_km / scale_km_per_tile))
    return x, y

def build_scenario_map(
    center_lat: float = 50.5,
    center_lon: float = 14.5,
    scale_km_per_tile: float = 0.5,
    mines: Optional[List[dict]] = None
) -> List[dict]:
    """Vytvoří seznam ložisek pro herní mapu s reálnými rozestupy."""
    source_mines = mines or FAMOUS_GLOBAL_MINES
    result = []
    for m in source_mines:
        gx, gy = geo_to_grid(m["lat"], m["lon"], center_lat, center_lon, scale_km_per_tile)
        ore_key = m.get("ore", "quartz")
        oi = ORE_NAME_MAP.get(ore_key, 1)
        result.append({
            "name": m["name"],
            "lat": m["lat"],
            "lon": m["lon"],
            "x": gx,
            "y": gy,
            "ore": ore_key,
            "ore_index": oi,
            "radius": m.get("radius", 8),
            "reserves_t": m.get("reserves_t", 50000000),
        })
    return result

def download_usgs_mrds(
    commodity: str = "copper",
    bbox: Optional[Tuple[float, float, float, float]] = None
) -> List[dict]:
    """Stáhne ložiska z veřejného USGS MRDS rozhraní nebo vrátí kurátorská geodata."""
    # USGS Mineral Resources Data System API endpoint
    if requests is None:
        print("requests knihovna není dostupná, používám integrovaná reálná geodata.")
        return [m for m in FAMOUS_GLOBAL_MINES if m.get("ore") == COMMODITY_TO_ORE.get(commodity.lower())]

    url = "https://mrdata.usgs.gov/mrds/find-mrds.php"
    params = {"f": "json", "commodity": commodity}
    if bbox:
        params["minlon"], params["minlat"], params["maxlon"], params["maxlat"] = bbox

    try:
        resp = requests.get(url, params=params, timeout=6)
        if resp.status_code == 200:
            data = resp.json()
            features = data.get("features", [])
            out = []
            for f in features:
                props = f.get("properties", {})
                coords = f.get("geometry", {}).get("coordinates", [0, 0])
                comm = props.get("commodity", commodity).lower()
                out.append({
                    "name": props.get("site_name", f"USGS Deposit {comm}"),
                    "lat": coords[1],
                    "lon": coords[0],
                    "ore": COMMODITY_TO_ORE.get(comm, "ore_cu"),
                    "reserves_t": 100000000,
                    "radius": 10,
                })
            if out:
                return out
    except Exception as e:
        print(f"Poznámka: online dotaz USGS nedostupný ({e}), použita ověřená integrovaná ložiska.")

    matched = [m for m in FAMOUS_GLOBAL_MINES if COMMODITY_TO_ORE.get(commodity.lower()) == m.get("ore")]
    return matched or FAMOUS_GLOBAL_MINES

def save_map_to_file(deposits: List[dict], filepath: str):
    """Uloží vygenerovaná ložiska do JSON souboru pro použití ve hře."""
    p = Path(filepath)
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(deposits, f, indent=2, ensure_ascii=False)
    print(f"Mapa světa s {len(deposits)} ložisky uložena do: {filepath}")
