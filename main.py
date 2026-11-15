#!/usr/bin/env python3
"""Hlavní spouštěcí soubor hry MakeYourCPU v Pythonu."""
import argparse
import json
import sys
from pathlib import Path

from make_your_cpu.sim import Sim
from make_your_cpu.importer import build_scenario_map, FAMOUS_GLOBAL_MINES

def main():
    parser = argparse.ArgumentParser(description="MakeYourCPU - Simulátor výroby, těžby a čipů v Pythonu")
    parser.add_argument("--scenario", choices=["default", "czechia", "global"], default="default",
                        help="Scénář ložisek: default (procedurální), czechia (Most, Sokolov, Cínovec), global (světová ložiska)")
    parser.add_argument("--sandbox", action="store_true", help="Spustit v sandbox režimu s neomezenými penězi")
    parser.add_argument("--headless", action="store_true", help="Spustit bez grafického rozhraní (simulační benchmark)")

    args = parser.parse_args()

    real_deposits = None
    if args.scenario == "czechia":
        cz_mines = [m for m in FAMOUS_GLOBAL_MINES if "Most" in m["name"] or "Sokolov" in m["name"] or "Cínovec" in m["name"] or "Střeleč" in m["name"]]
        real_deposits = build_scenario_map(center_lat=50.5, center_lon=14.0, scale_km_per_tile=0.5, mines=cz_mines)
        print(f"Načten scénář České republiky ({len(real_deposits)} reálných ložisek)")
    elif args.scenario == "global":
        real_deposits = build_scenario_map(center_lat=0.0, center_lon=0.0, scale_km_per_tile=1.0, mines=FAMOUS_GLOBAL_MINES)
        print(f"Načten globální scénář světa ({len(real_deposits)} světových ložisek)")

    sim = Sim(seed=42, sandbox=args.sandbox, real_deposits=real_deposits)

    if args.headless:
        print("Spouštím headless simulaci...")
        for _ in range(500):
            sim.tick(1.0 / 20.0)
        print(f"Simulace dokončena. Čas: {sim.t:.1f} s, Peníze: ${sim.money:,.0f}")
        return

    # Spuštění grafického rozhraní
    try:
        from make_your_cpu.game import GameApp
        app = GameApp(sim=sim)
        app.run()
    except Exception as e:
        print(f"Chyba při spuštění GUI: {e}")
        print("Můžeš spustit v headless režimu pomocí: python main.py --headless")

if __name__ == "__main__":
    main()
