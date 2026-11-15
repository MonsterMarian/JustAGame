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
    parser.add_argument("--scenario", choices=["earth", "czechia", "global"], default="earth",
                        help="Scénář ložisek a mapy: earth (výchozí: celá planeta Země i s ČR a světovými revíry)")
    parser.add_argument("--sandbox", action="store_true", help="Spustit v sandbox režimu s neomezenými penězi")
    parser.add_argument("--headless", action="store_true", help="Spustit bez grafického rozhraní (simulační benchmark)")

    args = parser.parse_args()

    print("=================================================================")
    print("  MakeYourCPU - Simulátor výroby a těžby na reálné Zemi")
    print("=================================================================")
    print("Načítám reálnou mapu světa, kontinenty a světová ložiska...")

    # Načtení reálných ložisek nerostů (ČR + Svět)
    real_deposits = build_scenario_map(center_lat=50.0, center_lon=14.5, scale_km_per_tile=1.0, mines=FAMOUS_GLOBAL_MINES)
    print(f"Úspěšně načteno {len(real_deposits)} reálných ložisek (Most, Cínovec, Střeleč, Escondida, Pilbara...).")
    print("Základna hráče (HQ Centrální Sklad) je umístěna v ČR s přístupem ke světovým revírům.")

    sim = Sim(
        seed=42,
        sandbox=args.sandbox,
        real_deposits=real_deposits,
        center_lat=50.0,
        center_lon=14.5,
        scale_km_per_tile=1.0,
        use_earth_geography=True
    )

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
