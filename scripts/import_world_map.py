#!/usr/bin/env python3
"""CLI skript pro stažení a generování mapy s reálnými ložisky ze světa."""
import argparse
import sys
from pathlib import Path

# Umožní přímé spuštění ze skriptů
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from make_your_cpu.importer import build_scenario_map, download_usgs_mrds, save_map_to_file, FAMOUS_GLOBAL_MINES

def main():
    parser = argparse.ArgumentParser(description="Stáhne / vygeneruje reálná ložiska nerostů ze světa pro MakeYourCPU.")
    parser.add_argument("--scenario", choices=["czechia", "global", "usgs"], default="global",
                        help="Scénář mapy: czechia (Most, Sokolov, Cínovec...), global (světová velkoložiska) nebo usgs (online data)")
    parser.add_argument("--commodity", default="copper", help="Komodita pro USGS dotaz (např. copper, coal, iron)")
    parser.add_argument("--scale", type=float, default=0.5, help="Měřítko km na dlaždici (výchozí 0.5 km/dlaždice)")
    parser.add_argument("--output", default="data/world_deposits.json", help="Výstupní JSON soubor pro hru")

    args = parser.parse_args()

    if args.scenario == "czechia":
        cz_mines = [m for m in FAMOUS_GLOBAL_MINES if "Most" in m["name"] or "Sokolov" in m["name"] or "Cínovec" in m["name"] or "Střeleč" in m["name"] or "Provodín" in m["name"]]
        deposits = build_scenario_map(center_lat=50.5, center_lon=14.0, scale_km_per_tile=args.scale, mines=cz_mines)
    elif args.scenario == "usgs":
        raw = download_usgs_mrds(commodity=args.commodity)
        deposits = build_scenario_map(center_lat=40.0, center_lon=-105.0, scale_km_per_tile=args.scale, mines=raw)
    else:
        deposits = build_scenario_map(center_lat=0.0, center_lon=0.0, scale_km_per_tile=args.scale, mines=FAMOUS_GLOBAL_MINES)

    save_map_to_file(deposits, args.output)
    print(f"Hotovo! Vygenerováno {len(deposits)} ložisek:")
    for d in deposits:
        print(f" - {d['name']} [{d['ore']}]: pozice x={d['x']}, y={d['y']} (rezerva {d['reserves_t']:,} t)")

if __name__ == "__main__":
    main()
