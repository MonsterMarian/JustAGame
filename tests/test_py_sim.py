"""Sada testů pro Python engine MakeYourCPU.
Testuje simulaci, moduly, vylepšení, reálná ložiska a mobilitu bagrů.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from make_your_cpu.sim import Sim, reach_of, pile_of, max_cars_of, hours_of, boost_of
from make_your_cpu.catalog import UPG, MODS, MODELS
from make_your_cpu.importer import build_scenario_map, geo_to_grid, FAMOUS_GLOBAL_MINES

def test_sim_init_and_upgrade_levels():
    sim = Sim(seed=4, sandbox=True)
    assert len(sim.list) >= 1  # HQ sklad existuje
    hq = sim.list[0]
    assert hq.get("hq") is True

    # 1. Postavení bagru a 5 úrovní vylepšení
    res = sim.place("quarry_hand", 22, -17)
    assert res.get("ok") is True
    miner = res["b"]
    assert miner["lv"] == 0
    assert reach_of(miner) == MODELS["quarry_hand"]["reach"]

    # Vylepšení na maximum (5 úrovní = 4 navýšení)
    upgraded_n = sim.upgrade_max(miner)
    assert upgraded_n == 4
    assert miner["lv"] == 4
    assert reach_of(miner) == MODELS["quarry_hand"]["reach"] + 4
    assert max_cars_of(miner) == 4 + 4

def test_mods_installation_and_bonuses():
    sim = Sim(seed=4, sandbox=True)
    res = sim.place("miner_u17", 22, -17)
    miner = res["b"]

    assert sim.install_mod(miner, "auto") is True
    assert sim.install_mod(miner, "auto") is False  # Nelze instalovat duplicitně
    assert "auto" in miner["mods"]

    # Modul auto zdvojnásobí odpracované hodiny a přidá +25 % výkonu
    assert hours_of(miner) == 16.0
    assert boost_of(miner) > (8.0 / 24.0) * 2.0

    # Hromadná instalace zbývajících modulů
    n_mods = sim.install_all_mods()
    assert n_mods >= 2
    assert "cool" in miner["mods"]
    assert "cap" in miner["mods"]
    assert pile_of(miner) == 80  # 2x hromada s modulem cap

def test_excavator_relocation_mobility():
    """Test mobility bagru: přejíždění mezi ložisky po vytěžení."""
    sim = Sim(seed=4, sandbox=True)
    # Postav bagr na souřadnice (22, -17)
    res = sim.place("miner_u17", 22, -17)
    miner = res["b"]
    assert miner["x"] == 22 and miner["y"] == -17

    # Ruční zahájení přesunu na nové místo (30, -10)
    assert sim.start_relocate(miner, 30, -10) is True
    assert miner["st"] == "moving"
    assert miner.get("relocating") is not None
    assert sim.at(22, -17) is None  # Původní dlaždice je uvolněna

    # Krok simulace: bagr se pohybuje
    duration = miner["relocating"]["duration"]
    sim.tick(duration * 0.5)
    assert miner["st"] == "moving"
    assert (miner["x"], miner["y"]) != (30, -10)

    # Dokončení přesunu
    sim.tick(duration * 0.6)
    assert miner.get("relocating") is None
    assert miner["st"] == "run"
    assert miner["x"] == 30 and miner["y"] == -10
    assert sim.at(30, -10) == miner  # Nové místo je obsazeno

def test_auto_relocate_when_empty():
    """Test automatického nalezení a přejezdu na jiné ložisko při vyčerpání."""
    sim = Sim(seed=4, sandbox=True)
    res = sim.place("quarry_hand", 100, 100)  # Místo bez nerostu
    miner = res["b"]
    miner["auto_move"] = True

    # Krok simulace zjistí, že v dosahu nic není, a automaticky spustí přesun
    sim.step_miner(miner, 1.0)
    assert miner["st"] == "moving"
    assert miner.get("relocating") is not None

def test_real_world_deposits_importer():
    """Test importu reálných ložisek a převodu GPS souřadnic."""
    x, y = geo_to_grid(lat=50.518, lon=13.642, center_lat=50.5, center_lon=14.0, scale_km_per_tile=0.5)
    assert isinstance(x, int) and isinstance(y, int)

    deposits = build_scenario_map(center_lat=50.5, center_lon=14.0, scale_km_per_tile=0.5)
    assert len(deposits) >= 5
    most = next(d for d in deposits if "Most" in d["name"])
    assert most["ore"] == "coal"
    assert most["reserves_t"] > 1000000

    # Vytvoření světa s reálnými ložisky
    sim_real = Sim(seed=4, sandbox=True, real_deposits=deposits)
    # Zkontroluj, že Mostecké ložisko uhlí existuje v herním světě
    assert sim_real._world.ore(most["x"], most["y"]) == 2  # 2 = coal
