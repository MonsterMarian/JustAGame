"""Kompletní simulační engine pro MakeYourCPU v Pythonu.
Obsahuje simulaci pásů, továren, dolů, logistiky, poruch, 5 úrovní vylepšení, modulů
a novou mechaniku: MOBILITA BAGRŮ (přejíždění bagrů mezi ložisky po vytěžení).
"""
import math
from typing import Dict, List, Optional, Tuple, Any
from .catalog import (
    KINDS, MODELS, ITEMS, CARS, BUYERS, SPOTS, LOGI, ORES, ROUTES, RESEARCH,
    MISSIONS, HOUR, DAY, KWH_USD, SELL, WAGE_DAY, FEED_USD, DIESEL_USD,
    DEPOT_FEE, GRID_MWH, PILE, MAXCARS, RESERVE, RC_OPEX, UPG, MODS, def_of
)
from .world import World, T_WATER, LEVEL_M, SURF_T, DEEP_T

DX = [1, 0, -1, 0]
DY = [0, 1, 0, -1]

def key(x: int, y: int) -> int:
    return (x + 32768) * 65536 + (y + 32768)

def center_of(b: dict) -> Tuple[float, float]:
    return (b["x"] + b.get("w", 1) / 2.0, b["y"] + b.get("h", 1) / 2.0)

def has_mod(b: dict, mod_id: str) -> bool:
    return mod_id in b.get("mods", [])

def pile_of(b: dict) -> int:
    return PILE * (2 if has_mod(b, "cap") else 1)

def max_cars_of(b: dict) -> int:
    return MAXCARS + b.get("lv", 0) + (2 if has_mod(b, "cap") else 0)

def reach_of(b: dict) -> int:
    m = MODELS.get(b.get("model", ""))
    return (m.get("reach", 0) if m else 0) + b.get("lv", 0)

def hours_of(b: dict) -> float:
    m = MODELS.get(b.get("model", ""))
    if not m or not m.get("crew"):
        return 24.0
    staff = b.get("staff", m["crew"])
    mult = 2.0 if has_mod(b, "auto") else 1.0
    return min(24.0, (8.0 * staff * mult) / m["crew"])

def boost_of(b: dict) -> float:
    auto_k = 1.25 if has_mod(b, "auto") else 1.0
    return (hours_of(b) / 24.0) * (1.0 + 0.5 * b.get("lv", 0)) * auto_k

def base_usd(b: dict) -> int:
    if b.get("k") == "hub":
        return 20000 if b.get("hq") else LOGI["dump" if b.get("dump") else "depot"]["usd"]
    return MODELS.get(b.get("model", ""), {}).get("usd", 0)

def mod_cost(b: dict, mod_id: str) -> Optional[int]:
    if not b or mod_id not in MODS:
        return None
    if not MODELS.get(b.get("model", "")) and not (b.get("k") == "hub" and b.get("hq") and mod_id == "cap"):
        return None
    return max(400, int(round(base_usd(b) * MODS[mod_id]["k"])))

def upgrade_cost(b: dict) -> Optional[int]:
    lv = b.get("lv", 0)
    if (b.get("k") == "hub" or MODELS.get(b.get("model", ""))) and lv < len(UPG):
        return int(round(base_usd(b) * UPG[lv]))
    return None

class Sim:
    """Stav a běh simulace."""

    def __init__(self, seed: int = 1337, sandbox: bool = False, real_deposits: Optional[List[dict]] = None):
        self.seed = seed
        self.sandbox = sandbox
        self.t = 0.0
        self.money = 1e12 if sandbox else 50000.0
        self.mwh = 0.0
        self.inv: Dict[str, float] = {}
        self.auto_sell: Dict[str, bool] = {}
        self.auto_buy: Dict[str, int] = {}
        self.sold: Dict[str, float] = {}
        self.made: Dict[str, float] = {}
        self.got: Dict[str, float] = {}
        self.research: List[str] = ["mine1", "smt1"] if sandbox else []
        self.pts = 99 if sandbox else 0
        self.dug: Dict[int, int] = {}
        self.list: List[dict] = []
        self._grid: Dict[int, dict] = {}
        self._road: Dict[int, int] = {}
        self._hall: set = set()
        self._floor: set = set()
        self._world = World(seed=seed, real_deposits=real_deposits)

        # Centrální sklad (HQ)
        hq = {"k": "hub", "hq": True, "x": -3, "y": -3, "w": 6, "h": 6, "lv": 0, "mods": []}
        self.list.append(hq)
        self.occupy(hq)

        # Odběratelé surovin
        for spot in SPOTS:
            t, x, y, mul = spot[0], spot[1], spot[2], spot[3]
            name = spot[4] if len(spot) > 4 else BUYERS[t]["name"]
            npc = {"k": "npc", "t": t, "x": x, "y": y, "w": 10, "h": 8, "mul": mul, "name": name}
            self.list.append(npc)
            self.occupy(npc)

    def occupy(self, b: dict):
        w = b.get("w", 1)
        h = b.get("h", 1)
        for j in range(h):
            for i in range(w):
                self._grid[key(b["x"] + i, b["y"] + j)] = b

    def unoccupy(self, b: dict):
        w = b.get("w", 1)
        h = b.get("h", 1)
        for j in range(h):
            for i in range(w):
                self._grid.pop(key(b["x"] + i, b["y"] + j), None)

    def at(self, x: int, y: int) -> Optional[dict]:
        return self._grid.get(key(x, y))

    def pay(self, usd: float) -> bool:
        if self.sandbox or self.money >= usd:
            self.money -= usd
            return True
        return False

    def can_place(self, item_id: str, x: int, y: int) -> Optional[str]:
        d = def_of(item_id)
        if not d:
            return "Neznámý objekt"
        w, h = d.get("w", 1), d.get("h", 1)
        for j in range(h):
            for i in range(w):
                X, Y = x + i, y + j
                if self._world.terrain(X, Y) == T_WATER and not d.get("road"):
                    return "Na vodě stavět nejde"
                if key(X, Y) in self._grid and not (item_id == "belt" and self._grid[key(X, Y)].get("k") == "belt"):
                    return "Obsazeno"
        return None

    def place(self, item_id: str, x: int, y: int, d: int = 0) -> dict:
        err = self.can_place(item_id, x, y)
        if err:
            return {"err": err}
        df = def_of(item_id)
        usd = df.get("usd", 0)
        if not self.pay(usd):
            return {"err": "Nedostatek peněz"}

        if df.get("road"):
            self._road[key(x, y)] = df.get("road", 1)
            return {"ok": True}

        b = {
            "k": "miner" if df.get("reach") else ("hub" if item_id in ("dump", "depot") else ("belt" if item_id == "belt" else "machine")),
            "x": x, "y": y, "w": df.get("w", 1), "h": df.get("h", 1), "d": d,
            "lv": 0, "mods": [], "out": [], "cars": [], "acc": 0.0,
            "st": "run" if df.get("reach") else "idle",
        }
        if item_id in ("dump", "depot"):
            b["dump"] = (item_id == "dump")
        else:
            b["model"] = item_id

        if b["k"] == "miner":
            b["oi"] = 0
            b["cur"] = None
            b["auto_move"] = True  # Povolit automatické přejíždění bagru při vytěžení

        self.list.append(b)
        self.occupy(b)
        return {"ok": True, "b": b}

    def upgrade(self, b: dict) -> bool:
        c = upgrade_cost(b)
        if c is None or not self.pay(c):
            return False
        b["lv"] = b.get("lv", 0) + 1
        return True

    def upgrade_max(self, b: dict) -> int:
        n = 0
        while self.upgrade(b):
            n += 1
        return n

    def install_mod(self, b: dict, mod_id: str) -> bool:
        if has_mod(b, mod_id):
            return False
        cost = mod_cost(b, mod_id)
        if cost is None or not self.pay(cost):
            return False
        b.setdefault("mods", []).append(mod_id)
        return True

    def install_all_mods(self) -> int:
        n = 0
        for b in self.list:
            for mod_id in MODS:
                if self.install_mod(b, mod_id):
                    n += 1
        return n

    # --- MOBILITA BAGRŮ (PŘEJÍŽDĚNÍ MEZI LOŽISKY) ---
    def find_nearest_deposit(self, b: dict, ore_idx: int = 0) -> Optional[Tuple[int, int]]:
        """Najde nejbližší volné ložisko dané suroviny pro přesun bagru."""
        cx, cy = center_of(b)
        best_pos = None
        best_dist = float("inf")
        reach = reach_of(b)

        # Prohledává se okolí do 300 m
        for r in range(8, 300, 4):
            for dy in range(-r, r + 1, 4):
                for dx in range(-r, r + 1, 4):
                    tx, ty = int(cx + dx), int(cy + dy)
                    oi = self._world.ore(tx, ty)
                    if oi > 0 and (ore_idx == 0 or oi == ore_idx):
                        # Zkontroluj, zda je kolem volné místo pro bagr
                        bw, bh = b.get("w", 1), b.get("h", 1)
                        free = True
                        for j in range(bh):
                            for i in range(bw):
                                o = self.at(tx + i, ty + j)
                                if (o and o != b) or self._world.terrain(tx + i, ty + j) == T_WATER:
                                    free = False
                                    break
                            if not free:
                                break
                        if free:
                            dist = math.hypot(dx, dy)
                            if dist < best_dist:
                                best_dist = dist
                                best_pos = (tx, ty)
            if best_pos:
                return best_pos
        return None

    def start_relocate(self, b: dict, target_x: int, target_y: int) -> bool:
        """Zahájí přesun bagru na nové ložisko."""
        if b.get("k") != "miner" or b.get("relocating"):
            return False
        self.unoccupy(b)
        dist = math.hypot(target_x - b["x"], target_y - b["y"])
        speed = 2.0  # dlaždice za sekundu (po terénu)
        b["relocating"] = {
            "start": (b["x"], b["y"]),
            "target": (target_x, target_y),
            "progress": 0.0,
            "duration": max(1.0, dist / speed),
        }
        b["st"] = "moving"
        b["cur"] = None
        return True

    def auto_relocate(self, b: dict) -> bool:
        """Automaticky přesune vytěžený bagr na nejbližší ložisko."""
        target = self.find_nearest_deposit(b, b.get("oi", 0))
        if target:
            return self.start_relocate(b, target[0], target[1])
        return False

    def step_miner(self, b: dict, dt: float):
        # 1. Přejíždějící bagr
        if b.get("relocating"):
            rel = b["relocating"]
            rel["progress"] += dt
            t_ratio = min(1.0, rel["progress"] / rel["duration"])
            sx, sy = rel["start"]
            tx, ty = rel["target"]
            b["x"] = int(round(sx + (tx - sx) * t_ratio))
            b["y"] = int(round(sy + (ty - sy) * t_ratio))
            if t_ratio >= 1.0:
                b["x"], b["y"] = tx, ty
                b["relocating"] = None
                self.occupy(b)
                b["st"] = "run"
                b["cur"] = None
            return

        m = MODELS.get(b.get("model", ""))
        if not m:
            return
        cx, cy = center_of(b)
        reach = reach_of(b)
        pile = pile_of(b)

        if len(b["out"]) >= pile:
            b["st"] = "full"
            return

        # Hledání nerostu v dosahu
        if not b.get("cur"):
            found = None
            for dy in range(-reach, reach + 1):
                for dx in range(-reach, reach + 1):
                    if dx * dx + dy * dy <= reach * reach:
                        tx, ty = int(cx + dx), int(cy + dy)
                        oi = self._world.ore(tx, ty)
                        if oi > 0:
                            dug_t = self.dug.get(key(tx, ty) * 8, 0)
                            if dug_t < SURF_T:
                                found = (tx, ty, oi)
                                break
                if found:
                    break
            if not found:
                b["st"] = "empty"
                if b.get("auto_move", True):
                    self.auto_relocate(b)
                return
            b["cur"] = [found[0], found[1]]
            b["oi"] = found[2]

        b["st"] = "run"
        b["acc"] += m["rate"] * boost_of(b) * (dt / HOUR)
        if b["acc"] >= 1.0:
            b["acc"] -= 1.0
            k_tile = key(b["cur"][0], b["cur"][1]) * 8
            self.dug[k_tile] = self.dug.get(k_tile, 0) + 1
            it = ORES[b["oi"]]["id"]
            b["out"].append(it)
            self.made[it] = self.made.get(it, 0) + 1

    def tick(self, dt: float = 1.0 / 20.0):
        self.t += dt
        for b in list(self.list):
            if b.get("k") == "miner":
                self.step_miner(b, dt)

            # Automatický odvoz / prodej hotových věcí
            if b.get("out"):
                hq = self.list[0]
                while b["out"]:
                    item = b["out"].pop(0)
                    self.inv[item] = self.inv.get(item, 0) + 1
                    # Auto-prodej surovin na trhu
                    price = ITEMS.get(item, {}).get("usd", 10.0) * SELL
                    self.money += price
                    self.sold[item] = self.sold.get(item, 0) + 1
