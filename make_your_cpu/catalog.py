"""Katalog herních prvků, modelů strojů, položek, logistiky a vozidel."""
import json
from pathlib import Path

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "game_data.json"

with open(DATA_FILE, "r", encoding="utf-8") as f:
    _RAW = json.load(f)

KINDS = _RAW["KINDS"]
MODELS = _RAW["MODELS"]
ITEMS = _RAW["ITEMS"]
CHIPS = _RAW["CHIPS"]
CARS = _RAW["CARS"]
BUYERS = _RAW["BUYERS"]
SPOTS = _RAW["SPOTS"]
LOGI = _RAW["LOGI"]
ORES = _RAW["ORES"]
STARTERS = _RAW["STARTERS"]
ROUTES = _RAW["ROUTES"]
RESEARCH = _RAW["RESEARCH"]
MISSIONS = _RAW["MISSIONS"]
STARTS = _RAW.get("STARTS", {})

HOUR = 6.0
DAY = 24 * HOUR
KWH_USD = 0.1
SELL = 0.85
WAGE_DAY = 150.0
FEED_USD = 47.0
DIESEL_USD = 1.619
DEPOT_FEE = 2.0
GRID_MWH = 20.0
PILE = 40
MAXCARS = 4
RESERVE = 20
RC_OPEX = 50.0

UPG = [1.5, 3.0, 6.0, 10.0]

MODS = {
    "auto": {
        "id": "auto",
        "name": "Automatizace a PLC řízení",
        "icon": "⚡",
        "k": 1.2,
        "desc": "+25 % rychlost a plný 24h provoz i s poloviční obsluhou",
    },
    "cool": {
        "id": "cool",
        "name": "Průmyslové chlazení a diagnostika",
        "icon": "🛡️",
        "k": 1.0,
        "desc": "3× méně poruch, poloviční doba opravy (4 h) a −25 % spotřeba energie a nafty",
    },
    "cap": {
        "id": "cap",
        "name": "Rozšířená rampa a zásobníky",
        "icon": "📦",
        "k": 0.9,
        "desc": "2× větší hromada / vstupní zásobníky a +2 nákladní auta u budovy",
    },
}

def def_of(item_id: str):
    return LOGI.get(item_id) or MODELS.get(item_id)
