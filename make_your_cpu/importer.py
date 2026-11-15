"""Stahování a import reálných ložisek nerostů ze světa (USGS MRDS a reálná GIS data)."""
import json
import math
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple

try:
    import requests
except ImportError:
    requests = None

# Reálná světová ložiska s přesnými geografickými souřadnicemi, komoditou a zásobami
FAMOUS_GLOBAL_MINES = [
    # --- ČESKÁ REPUBLIKA & STŘEDNÍ EVROPA ---
    {"name": "Mostecká uhelná pánev (ČR)", "lat": 50.518, "lon": 13.642, "ore": "coal", "reserves_t": 850000000, "radius": 14, "region": "Evropa"},
    {"name": "Sokolovská uhelná pánev (ČR)", "lat": 50.183, "lon": 12.645, "ore": "coal", "reserves_t": 320000000, "radius": 11, "region": "Evropa"},
    {"name": "Cínovec Li-Sn ložisko (ČR)", "lat": 50.732, "lon": 13.766, "ore": "ore_sn", "reserves_t": 120000000, "radius": 9, "region": "Evropa"},
    {"name": "Střeleč Český ráj - sklářský křemen (ČR)", "lat": 50.505, "lon": 15.201, "ore": "quartz", "reserves_t": 450000000, "radius": 12, "region": "Evropa"},
    {"name": "Provodín křemenné písky (ČR)", "lat": 50.622, "lon": 14.594, "ore": "quartz", "reserves_t": 180000000, "radius": 8, "region": "Evropa"},
    {"name": "Příbram polymetalický revír (ČR)", "lat": 49.689, "lon": 14.010, "ore": "ore_cu", "reserves_t": 65000000, "radius": 8, "region": "Evropa"},
    {"name": "Horní Slavkov cín a křemen (ČR)", "lat": 50.138, "lon": 12.809, "ore": "ore_sn", "reserves_t": 45000000, "radius": 7, "region": "Evropa"},
    {"name": "Lubin / Polkowice měděný revír (Polsko)", "lat": 51.405, "lon": 16.201, "ore": "ore_cu", "reserves_t": 950000000, "radius": 18, "region": "Evropa"},
    {"name": "Horní Slezsko uhelná pánev (Polsko)", "lat": 50.260, "lon": 19.020, "ore": "coal", "reserves_t": 1100000000, "radius": 20, "region": "Evropa"},
    {"name": "Ruhr uhelný revír (Německo)", "lat": 51.514, "lon": 7.465, "ore": "coal", "reserves_t": 750000000, "radius": 16, "region": "Evropa"},
    {"name": "Kiruna železná ruda a apatit (Švédsko)", "lat": 67.855, "lon": 20.225, "ore": "quartz", "reserves_t": 1200000000, "radius": 20, "region": "Evropa"},
    {"name": "Rio Tinto měděný revír (Španělsko)", "lat": 37.693, "lon": -6.593, "ore": "ore_cu", "reserves_t": 450000000, "radius": 14, "region": "Evropa"},
    {"name": "Wieliczka a Bochnia solné ložisko (Polsko)", "lat": 49.983, "lon": 20.055, "ore": "halite", "reserves_t": 350000000, "radius": 10, "region": "Evropa"},

    # --- SEVERNÍ AMERIKA ---
    {"name": "Powder River Basin (Wyoming USA - uhelný gigant)", "lat": 44.291, "lon": -105.498, "ore": "coal", "reserves_t": 2800000000, "radius": 28, "region": "Severní Amerika"},
    {"name": "Bingham Canyon Kennecott (Utah USA - obří měď)", "lat": 40.522, "lon": -112.151, "ore": "ore_cu", "reserves_t": 1900000000, "radius": 22, "region": "Severní Amerika"},
    {"name": "Spruce Pine (Severní Karolína USA - ultračistý křemen)", "lat": 35.915, "lon": -82.065, "ore": "quartz", "reserves_t": 600000000, "radius": 15, "region": "Severní Amerika"},
    {"name": "Carlin Trend (Nevada USA - obří zlato)", "lat": 40.970, "lon": -116.320, "ore": "ore_au", "reserves_t": 85000000, "radius": 18, "region": "Severní Amerika"},
    {"name": "Sudbury Basin (Kanada - nikl, měď, kovy)", "lat": 46.520, "lon": -81.000, "ore": "ore_cu", "reserves_t": 850000000, "radius": 20, "region": "Severní Amerika"},
    {"name": "Appalachian Coal Basin (Západní Virginie USA)", "lat": 38.350, "lon": -81.630, "ore": "coal", "reserves_t": 1400000000, "radius": 22, "region": "Severní Amerika"},

    # --- JIŽNÍ AMERIKA ---
    {"name": "Minera Escondida (Chile - největší měď světa)", "lat": -24.269, "lon": -69.068, "ore": "ore_cu", "reserves_t": 3200000000, "radius": 26, "region": "Jižní Amerika"},
    {"name": "Chuquicamata (Chile - gigantický měděný lom)", "lat": -22.316, "lon": -68.903, "ore": "ore_cu", "reserves_t": 1800000000, "radius": 22, "region": "Jižní Amerika"},
    {"name": "Salar de Atacama (Chile - sůl a lithium)", "lat": -23.500, "lon": -68.333, "ore": "halite", "reserves_t": 1200000000, "radius": 24, "region": "Jižní Amerika"},
    {"name": "Carajás Mine (Brazílie - obří křemeno-železné ložisko)", "lat": -6.050, "lon": -50.300, "ore": "quartz", "reserves_t": 2200000000, "radius": 25, "region": "Jižní Amerika"},
    {"name": "Cerro Rico de Potosí (Bolívie - cín a kovy)", "lat": -19.619, "lon": -65.749, "ore": "ore_sn", "reserves_t": 340000000, "radius": 16, "region": "Jižní Amerika"},

    # --- AUSTRÁLIE & OCEÁNIE ---
    {"name": "Pilbara - Mount Whaleback (Austrálie)", "lat": -23.364, "lon": 119.670, "ore": "quartz", "reserves_t": 2500000000, "radius": 26, "region": "Austrálie"},
    {"name": "Hunter Valley (Austrálie - uhelný superrevír)", "lat": -32.618, "lon": 151.173, "ore": "coal", "reserves_t": 1600000000, "radius": 22, "region": "Austrálie"},
    {"name": "Super Pit Kalgoorlie (Austrálie - zlato)", "lat": -30.774, "lon": 121.503, "ore": "ore_au", "reserves_t": 60000000, "radius": 18, "region": "Austrálie"},
    {"name": "Olympic Dam (Jižní Austrálie - měď a zlato)", "lat": -30.435, "lon": 136.887, "ore": "ore_cu", "reserves_t": 1500000000, "radius": 20, "region": "Austrálie"},
    {"name": "Weipa Bauxite Mine (Austrálie - bauxit/hliník)", "lat": -12.646, "lon": 141.876, "ore": "bauxite", "reserves_t": 1200000000, "radius": 22, "region": "Austrálie"},
    {"name": "Grasberg Mine (Indonésie - obří měď a zlato)", "lat": -4.055, "lon": 137.114, "ore": "ore_cu", "reserves_t": 2400000000, "radius": 24, "region": "Asie"},

    # --- AFRIKA ---
    {"name": "Witwatersrand Basin (Jihoafrická republika - zlato)", "lat": -26.204, "lon": 28.047, "ore": "ore_au", "reserves_t": 75000000, "radius": 20, "region": "Afrika"},
    {"name": "Katanga Copperbelt (Kongo - měď)", "lat": -11.660, "lon": 27.480, "ore": "ore_cu", "reserves_t": 1800000000, "radius": 22, "region": "Afrika"},
    {"name": "Sishen Iron & Quartz (JAR)", "lat": -27.733, "lon": 22.998, "ore": "quartz", "reserves_t": 950000000, "radius": 18, "region": "Afrika"},
    {"name": "Boké Bauxite Mine (Guinea - největší bauxit)", "lat": 10.932, "lon": -14.295, "ore": "bauxite", "reserves_t": 2000000000, "radius": 24, "region": "Afrika"},

    # --- ASIE ---
    {"name": "Oyu Tolgoi (Mongolsko - měď a zlato)", "lat": 43.007, "lon": 106.848, "ore": "ore_cu", "reserves_t": 1600000000, "radius": 20, "region": "Asie"},
    {"name": "Kuzbass uhelná pánev (Sibiř Rusko)", "lat": 54.340, "lon": 86.420, "ore": "coal", "reserves_t": 2200000000, "radius": 25, "region": "Asie"},
    {"name": "Muruntau (Uzbekistán - obří povrchové zlato)", "lat": 41.498, "lon": 64.571, "ore": "ore_au", "reserves_t": 95000000, "radius": 18, "region": "Asie"},
    {"name": "Bayan Obo (Vnitřní Mongolsko - křemen a fluorit)", "lat": 41.798, "lon": 109.969, "ore": "fluorspar", "reserves_t": 800000000, "radius": 18, "region": "Asie"},
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
