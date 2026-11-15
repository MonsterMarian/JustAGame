"""Stahování a import reálných ložisek nerostů ze světa (USGS MRDS a reálná GIS data)."""
import json
import math
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple

try:
    import requests
except ImportError:
    requests = None

def fmt_reserves(t: int) -> str:
    """Zformátuje tuny do čitelného odhadu (např. 14,5 Mt, 850 kt, 1,2 Gt)."""
    if t >= 1_000_000_000:
        return f"{t / 1_000_000_000:.1f} Gt".replace(".", ",")
    if t >= 1_000_000:
        return f"{t / 1_000_000:.1f} Mt".replace(".", ",")
    if t >= 1_000:
        return f"{t / 1_000:.0f} kt".replace(".", ",")
    return f"{t} t"

# Reálná světová a lokální ložiska s přesnými geografickými souřadnicemi, komoditou, stavem a odhadem zásob.
# status: 'active' (v provozu / těží se) vs 'free' (volné k těžbě / neotevřené / průzkumné ložisko)
FAMOUS_GLOBAL_MINES = [
    # =========================================================================
    # --- ČESKÁ REPUBLIKA A SLOVENSKO (Velké i malé lomy, doly a volná ložiska) ---
    # =========================================================================
    # Aktivní těžba v ČR
    {"name": "Mostecká uhelná pánev (ČR)", "lat": 50.518, "lon": 13.642, "ore": "coal", "status": "active", "reserves_t": 850000000, "radius": 14, "region": "Česko", "kind": "uhelný velkolom"},
    {"name": "Lom Bílina (ČR)", "lat": 50.556, "lon": 13.731, "ore": "coal", "status": "active", "reserves_t": 180000000, "radius": 11, "region": "Česko", "kind": "uhelný velkolom"},
    {"name": "Lom ČSA - Mostecko (ČR)", "lat": 50.547, "lon": 13.528, "ore": "coal", "status": "active", "reserves_t": 65000000, "radius": 10, "region": "Česko", "kind": "uhelný velkolom"},
    {"name": "Lom Libouš / Tušimice (ČR)", "lat": 50.413, "lon": 13.332, "ore": "coal", "status": "active", "reserves_t": 210000000, "radius": 12, "region": "Česko", "kind": "uhelný velkolom"},
    {"name": "Sokolovská uhelná pánev / Lom Jiří (ČR)", "lat": 50.183, "lon": 12.645, "ore": "coal", "status": "active", "reserves_t": 320000000, "radius": 11, "region": "Česko", "kind": "uhelný velkolom"},
    {"name": "Lom Družba - Sokolov (ČR)", "lat": 50.215, "lon": 12.685, "ore": "coal", "status": "active", "reserves_t": 85000000, "radius": 9, "region": "Česko", "kind": "uhelný velkolom"},
    {"name": "Cínovec Li-Sn ložisko (ČR)", "lat": 50.732, "lon": 13.766, "ore": "ore_sn", "status": "active", "reserves_t": 120000000, "radius": 9, "region": "Česko", "kind": "hlubinný rudný důl"},
    {"name": "Střeleč Český ráj - sklářský křemen (ČR)", "lat": 50.505, "lon": 15.201, "ore": "quartz", "status": "active", "reserves_t": 450000000, "radius": 12, "region": "Česko", "kind": "sklářská pískovna"},
    {"name": "Provodín křemenné písky (ČR)", "lat": 50.622, "lon": 14.594, "ore": "quartz", "status": "active", "reserves_t": 180000000, "radius": 8, "region": "Česko", "kind": "křemenná pískovna"},
    {"name": "Kaznějov - kaolín a křemen (ČR)", "lat": 49.889, "lon": 13.376, "ore": "quartz", "status": "active", "reserves_t": 95000000, "radius": 8, "region": "Česko", "kind": "kaolínový lom"},
    {"name": "Chlumčany u Plzně - živce a křemen (ČR)", "lat": 49.626, "lon": 13.332, "ore": "quartz", "status": "active", "reserves_t": 70000000, "radius": 7, "region": "Česko", "kind": "živcový lom"},
    {"name": "Příbram polymetalický revír (ČR)", "lat": 49.689, "lon": 14.010, "ore": "ore_cu", "status": "active", "reserves_t": 65000000, "radius": 8, "region": "Česko", "kind": "hlubinný důl na měď"},
    {"name": "Horní Slavkov cín a křemen (ČR)", "lat": 50.138, "lon": 12.809, "ore": "ore_sn", "status": "active", "reserves_t": 45000000, "radius": 7, "region": "Česko", "kind": "cínový revír"},
    {"name": "Lom Mořina / Velká Amerika (ČR)", "lat": 49.957, "lon": 14.195, "ore": "quartz", "status": "active", "reserves_t": 80000000, "radius": 8, "region": "Česko", "kind": "křemencový lom"},
    {"name": "Lom Mokrá u Brna (ČR)", "lat": 49.221, "lon": 16.749, "ore": "quartz", "status": "active", "reserves_t": 110000000, "radius": 8, "region": "Česko", "kind": "vápencovo-křemenný lom"},
    {"name": "Pískovna Dobříň - Labe (ČR)", "lat": 50.442, "lon": 14.288, "ore": "quartz", "status": "active", "reserves_t": 45000000, "radius": 6, "region": "Česko", "kind": "štěrkopískovna"},
    {"name": "Pískovna Tovačov - Morava (ČR)", "lat": 49.431, "lon": 17.295, "ore": "quartz", "status": "active", "reserves_t": 35000000, "radius": 6, "region": "Česko", "kind": "štěrkopískovna"},
    {"name": "Pískovna Hulín (ČR)", "lat": 49.317, "lon": 17.472, "ore": "quartz", "status": "active", "reserves_t": 28000000, "radius": 5, "region": "Česko", "kind": "malá štěrkopískovna"},
    {"name": "Kamenolom Zbraslav (ČR)", "lat": 49.965, "lon": 14.394, "ore": "quartz", "status": "active", "reserves_t": 50000000, "radius": 6, "region": "Česko", "kind": "kamenolom"},
    {"name": "Rožná pod Perštejnem (ČR)", "lat": 49.475, "lon": 16.236, "ore": "quartz", "status": "active", "reserves_t": 40000000, "radius": 6, "region": "Česko", "kind": "hlubinné ložisko"},
    {"name": "Handlová a Nováky (Slovensko)", "lat": 48.728, "lon": 18.756, "ore": "coal", "status": "active", "reserves_t": 75000000, "radius": 8, "region": "Slovensko", "kind": "uhelný revír"},
    {"name": "Jelšava magnezit a křemen (Slovensko)", "lat": 48.628, "lon": 20.241, "ore": "quartz", "status": "active", "reserves_t": 160000000, "radius": 9, "region": "Slovensko", "kind": "hlubinný lom"},

    # Volná / Neotevřená ložiska v ČR (vhodná k novému zahájení těžby)
    {"name": "Cínovec Sever - hlubinné patro (ČR)", "lat": 50.745, "lon": 13.780, "ore": "ore_sn", "status": "free", "reserves_t": 650000000, "radius": 11, "region": "Česko", "kind": "volné lithné a cínové ložisko"},
    {"name": "Mokrsko u Slap - zlatonosný křemen (ČR)", "lat": 49.778, "lon": 14.341, "ore": "ore_au", "status": "free", "reserves_t": 110000000, "radius": 8, "region": "Česko", "kind": "volné zlatonosné ložisko"},
    {"name": "Kašperské Hory - Šumava (ČR)", "lat": 49.143, "lon": 13.555, "ore": "ore_au", "status": "free", "reserves_t": 95000000, "radius": 8, "region": "Česko", "kind": "volné zlatonosné ložisko"},
    {"name": "Krásno - Gellnau cínové žíly (ČR)", "lat": 50.119, "lon": 12.802, "ore": "ore_sn", "status": "free", "reserves_t": 35000000, "radius": 6, "region": "Česko", "kind": "volné cínové ložisko"},
    {"name": "Krupka - Preisselberg fluorit a cín (ČR)", "lat": 50.686, "lon": 13.868, "ore": "fluorspar", "status": "free", "reserves_t": 25000000, "radius": 6, "region": "Česko", "kind": "volné fluoritové ložisko"},
    {"name": "Moldava v Krušných horách (ČR)", "lat": 50.716, "lon": 13.687, "ore": "fluorspar", "status": "free", "reserves_t": 18000000, "radius": 5, "region": "Česko", "kind": "volné fluoritové ložisko"},
    {"name": "Vidnava - křemenné kaoliny (ČR)", "lat": 50.372, "lon": 17.186, "ore": "quartz", "status": "free", "reserves_t": 40000000, "radius": 6, "region": "Česko", "kind": "volné křemenné ložisko"},
    {"name": "Chotěboř - Doubravka křemen (ČR)", "lat": 49.718, "lon": 15.670, "ore": "quartz", "status": "free", "reserves_t": 28000000, "radius": 6, "region": "Česko", "kind": "volné křemenné ložisko"},
    {"name": "Zlaté Hory - Příčná hora (ČR)", "lat": 50.250, "lon": 17.382, "ore": "ore_cu", "status": "free", "reserves_t": 55000000, "radius": 7, "region": "Česko", "kind": "volné polymetalické ložisko"},
    {"name": "Křižany u Liberce - fluorit (ČR)", "lat": 50.768, "lon": 14.945, "ore": "fluorspar", "status": "free", "reserves_t": 14000000, "radius": 5, "region": "Česko", "kind": "volné fluoritové ložisko"},
    {"name": "Bánov u Uherského Brodu (ČR)", "lat": 48.988, "lon": 17.718, "ore": "quartz", "status": "free", "reserves_t": 16000000, "radius": 5, "region": "Česko", "kind": "volný křemenný lom"},

    # =========================================================================
    # --- EVROPA (Aktivní velkodoly i volná neotevřená ložiska) ---
    # =========================================================================
    {"name": "Lubin / Polkowice měděný revír (Polsko)", "lat": 51.405, "lon": 16.201, "ore": "ore_cu", "status": "active", "reserves_t": 950000000, "radius": 18, "region": "Evropa", "kind": "obří měděný revír"},
    {"name": "Rudna důl na měď (Polsko)", "lat": 51.512, "lon": 16.142, "ore": "ore_cu", "status": "active", "reserves_t": 600000000, "radius": 15, "region": "Evropa", "kind": "hlubinná měď"},
    {"name": "Horní Slezsko uhelná pánev (Polsko)", "lat": 50.260, "lon": 19.020, "ore": "coal", "status": "active", "reserves_t": 1100000000, "radius": 20, "region": "Evropa", "kind": "uhelný revír"},
    {"name": "Bełchatów hnědouhelný velkolom (Polsko)", "lat": 51.233, "lon": 19.333, "ore": "coal", "status": "active", "reserves_t": 1100000000, "radius": 19, "region": "Evropa", "kind": "uhelný velkolom"},
    {"name": "Wieliczka a Bochnia solné ložisko (Polsko)", "lat": 49.983, "lon": 20.055, "ore": "halite", "status": "active", "reserves_t": 350000000, "radius": 10, "region": "Evropa", "kind": "solný důl"},
    {"name": "Kłodawa kamenná sůl (Polsko)", "lat": 52.247, "lon": 18.916, "ore": "halite", "status": "active", "reserves_t": 420000000, "radius": 11, "region": "Evropa", "kind": "aktivní solný důl"},
    {"name": "Hambach uhelný velkolom (Německo)", "lat": 50.912, "lon": 6.512, "ore": "coal", "status": "active", "reserves_t": 1300000000, "radius": 21, "region": "Evropa", "kind": "obří uhelný velkolom"},
    {"name": "Garzweiler uhelný velkolom (Německo)", "lat": 51.050, "lon": 6.495, "ore": "coal", "status": "active", "reserves_t": 900000000, "radius": 18, "region": "Evropa", "kind": "uhelný velkolom"},
    {"name": "Ruhr uhelný revír (Německo)", "lat": 51.514, "lon": 7.465, "ore": "coal", "status": "active", "reserves_t": 750000000, "radius": 16, "region": "Evropa", "kind": "uhelný revír"},
    {"name": "Freiberg Krušnohoří - cín a fluorit (Německo)", "lat": 50.917, "lon": 13.342, "ore": "fluorspar", "status": "free", "reserves_t": 160000000, "radius": 10, "region": "Evropa", "kind": "volné fluoritové ložisko"},
    {"name": "Kiruna železná ruda a křemen (Švédsko)", "lat": 67.855, "lon": 20.225, "ore": "quartz", "status": "active", "reserves_t": 1200000000, "radius": 20, "region": "Evropa", "kind": "podzemní megadůl"},
    {"name": "Aitik měděný velkolom (Švédsko)", "lat": 67.070, "lon": 20.950, "ore": "ore_cu", "status": "active", "reserves_t": 800000000, "radius": 18, "region": "Evropa", "kind": "povrchový lom mědi"},
    {"name": "Norra Kärr vzácné nerosty a fluorit (Švédsko)", "lat": 58.096, "lon": 14.566, "ore": "fluorspar", "status": "free", "reserves_t": 110000000, "radius": 9, "region": "Evropa", "kind": "volné ložisko"},
    {"name": "Rio Tinto měděný revír (Španělsko)", "lat": 37.693, "lon": -6.593, "ore": "ore_cu", "status": "active", "reserves_t": 450000000, "radius": 14, "region": "Evropa", "kind": "historický měděný revír"},
    {"name": "Neves-Corvo měď a cín (Portugalsko)", "lat": 37.585, "lon": -7.973, "ore": "ore_cu", "status": "active", "reserves_t": 320000000, "radius": 13, "region": "Evropa", "kind": "hlubinná měď a cín"},
    {"name": "Jadar Valley ložisko lithia a boru (Srbsko)", "lat": 44.550, "lon": 19.280, "ore": "fluorspar", "status": "free", "reserves_t": 140000000, "radius": 10, "region": "Evropa", "kind": "volné obří ložisko"},
    {"name": "Rovina Valley měď a zlato (Rumunsko)", "lat": 46.120, "lon": 22.850, "ore": "ore_cu", "status": "free", "reserves_t": 400000000, "radius": 12, "region": "Evropa", "kind": "volné měděné ložisko"},
    {"name": "Skouries zlato a měď (Řecko)", "lat": 40.470, "lon": 23.700, "ore": "ore_au", "status": "free", "reserves_t": 300000000, "radius": 11, "region": "Evropa", "kind": "volné ložisko zlata"},
    {"name": "Solotvyno kamenná sůl (Ukrajina)", "lat": 47.955, "lon": 23.871, "ore": "halite", "status": "active", "reserves_t": 250000000, "radius": 10, "region": "Evropa", "kind": "solný důl"},
    {"name": "Kryvyj Rih ruda a křemen (Ukrajina)", "lat": 47.910, "lon": 33.390, "ore": "quartz", "status": "active", "reserves_t": 1500000000, "radius": 22, "region": "Evropa", "kind": "těžební pánev"},
    {"name": "Donbas uhelný revír (Ukrajina)", "lat": 48.000, "lon": 37.800, "ore": "coal", "status": "active", "reserves_t": 2100000000, "radius": 24, "region": "Evropa", "kind": "uhelný revír"},

    # =========================================================================
    # --- SEVERNÍ AMERIKA ---
    # =========================================================================
    {"name": "Powder River Basin (Wyoming USA)", "lat": 44.291, "lon": -105.498, "ore": "coal", "status": "active", "reserves_t": 2800000000, "radius": 28, "region": "Severní Amerika", "kind": "uhelný superrevír"},
    {"name": "Bingham Canyon Kennecott (Utah USA)", "lat": 40.522, "lon": -112.151, "ore": "ore_cu", "status": "active", "reserves_t": 1900000000, "radius": 22, "region": "Severní Amerika", "kind": "nejhlubší povrchový lom mědi"},
    {"name": "Spruce Pine polovodičový křemen (Severní Karolína USA)", "lat": 35.915, "lon": -82.065, "ore": "quartz", "status": "active", "reserves_t": 600000000, "radius": 15, "region": "Severní Amerika", "kind": "ultračistý křemen"},
    {"name": "Carlin Trend obří zlato (Nevada USA)", "lat": 40.970, "lon": -116.320, "ore": "ore_au", "status": "active", "reserves_t": 85000000, "radius": 18, "region": "Severní Amerika", "kind": "zlatý revír"},
    {"name": "Sudbury Basin (Kanada)", "lat": 46.520, "lon": -81.000, "ore": "ore_cu", "status": "active", "reserves_t": 850000000, "radius": 20, "region": "Severní Amerika", "kind": "polymetalický revír"},
    {"name": "Appalachian Coal Basin (USA)", "lat": 38.350, "lon": -81.630, "ore": "coal", "status": "active", "reserves_t": 1400000000, "radius": 22, "region": "Severní Amerika", "kind": "uhelný revír"},
    {"name": "Bonneville Salt Flats (Utah USA)", "lat": 40.799, "lon": -113.850, "ore": "halite", "status": "active", "reserves_t": 800000000, "radius": 16, "region": "Severní Amerika", "kind": "solné jezero"},
    {"name": "Green River Basin trona a sůl (Wyoming USA)", "lat": 41.528, "lon": -109.466, "ore": "halite", "status": "active", "reserves_t": 1200000000, "radius": 19, "region": "Severní Amerika", "kind": "minerální sůl"},
    {"name": "Pebble Mine volné ložisko mědi a zlata (Aljaška USA)", "lat": 59.896, "lon": -155.300, "ore": "ore_cu", "status": "free", "reserves_t": 6500000000, "radius": 30, "region": "Severní Amerika", "kind": "gigantické volné ložisko"},
    {"name": "Resolution Copper podzemní projekt (Arizona USA)", "lat": 33.303, "lon": -111.096, "ore": "ore_cu", "status": "free", "reserves_t": 1700000000, "radius": 20, "region": "Severní Amerika", "kind": "volné ložisko mědi"},
    {"name": "Donlin Gold volné ložisko (Aljaška USA)", "lat": 62.030, "lon": -158.210, "ore": "ore_au", "status": "free", "reserves_t": 540000000, "radius": 16, "region": "Severní Amerika", "kind": "volné zlaté ložisko"},
    {"name": "KSM Deposit měď a zlato (Kanada)", "lat": 56.550, "lon": -130.500, "ore": "ore_cu", "status": "free", "reserves_t": 3200000000, "radius": 24, "region": "Severní Amerika", "kind": "volné obří ložisko"},
    {"name": "Casino Project měď a zlato (Yukon Kanada)", "lat": 62.740, "lon": -138.820, "ore": "ore_cu", "status": "free", "reserves_t": 1200000000, "radius": 18, "region": "Severní Amerika", "kind": "volné rudné ložisko"},

    # =========================================================================
    # --- JIŽNÍ AMERIKA ---
    # =========================================================================
    {"name": "Minera Escondida největší měď (Chile)", "lat": -24.269, "lon": -69.068, "ore": "ore_cu", "status": "active", "reserves_t": 3200000000, "radius": 26, "region": "Jižní Amerika", "kind": "světový gigant mědi"},
    {"name": "Chuquicamata obří měděný lom (Chile)", "lat": -22.316, "lon": -68.903, "ore": "ore_cu", "status": "active", "reserves_t": 1800000000, "radius": 22, "region": "Jižní Amerika", "kind": "obří měděný lom"},
    {"name": "Salar de Atacama sůl a lithium (Chile)", "lat": -23.500, "lon": -68.333, "ore": "halite", "status": "active", "reserves_t": 1200000000, "radius": 24, "region": "Jižní Amerika", "kind": "solná pláň"},
    {"name": "Salar de Uyuni volné solné ložisko (Bolívie)", "lat": -20.133, "lon": -67.489, "ore": "halite", "status": "free", "reserves_t": 21000000000, "radius": 32, "region": "Jižní Amerika", "kind": "největší solná pláň světa"},
    {"name": "Carajás Mine křemen a ruda (Brazílie)", "lat": -6.050, "lon": -50.300, "ore": "quartz", "status": "active", "reserves_t": 2200000000, "radius": 25, "region": "Jižní Amerika", "kind": "obří povrchový komplex"},
    {"name": "Salobo měď a zlato (Brazílie)", "lat": -5.800, "lon": -50.550, "ore": "ore_cu", "status": "active", "reserves_t": 1100000000, "radius": 19, "region": "Jižní Amerika", "kind": "těžba mědi"},
    {"name": "Cerro Rico de Potosí cín a kovy (Bolívie)", "lat": -19.619, "lon": -65.749, "ore": "ore_sn", "status": "active", "reserves_t": 340000000, "radius": 16, "region": "Jižní Amerika", "kind": "historický cínový důl"},
    {"name": "Cerrejón uhelný velkolom (Kolumbie)", "lat": 11.100, "lon": -72.670, "ore": "coal", "status": "active", "reserves_t": 1500000000, "radius": 22, "region": "Jižní Amerika", "kind": "uhelný velkolom"},

    # =========================================================================
    # --- AUSTRÁLIE A OCEÁNIE ---
    # =========================================================================
    {"name": "Pilbara - Mount Whaleback (Austrálie)", "lat": -23.364, "lon": 119.670, "ore": "quartz", "status": "active", "reserves_t": 2500000000, "radius": 26, "region": "Austrálie", "kind": "obří železo-křemenný lom"},
    {"name": "Hunter Valley uhelný revír (Austrálie)", "lat": -32.618, "lon": 151.173, "ore": "coal", "status": "active", "reserves_t": 1600000000, "radius": 22, "region": "Austrálie", "kind": "uhelný revír"},
    {"name": "Super Pit Kalgoorlie zlato (Austrálie)", "lat": -30.774, "lon": 121.503, "ore": "ore_au", "status": "active", "reserves_t": 60000000, "radius": 18, "region": "Austrálie", "kind": "zlatý megadůl"},
    {"name": "Olympic Dam měď a zlato (Jižní Austrálie)", "lat": -30.435, "lon": 136.887, "ore": "ore_cu", "status": "active", "reserves_t": 1500000000, "radius": 20, "region": "Austrálie", "kind": "podzemní revír mědi"},
    {"name": "Greenbushes lithium a cín (Austrálie)", "lat": -33.860, "lon": 116.020, "ore": "ore_sn", "status": "active", "reserves_t": 380000000, "radius": 14, "region": "Austrálie", "kind": "pegmatitové ložisko"},
    {"name": "Weipa bauxitový gigant (Austrálie)", "lat": -12.646, "lon": 141.876, "ore": "bauxite", "status": "active", "reserves_t": 1200000000, "radius": 22, "region": "Austrálie", "kind": "bauxitový povrchový lom"},
    {"name": "Gove bauxitový důl (Austrálie)", "lat": -12.280, "lon": 136.830, "ore": "bauxite", "status": "active", "reserves_t": 650000000, "radius": 17, "region": "Austrálie", "kind": "bauxitový lom"},
    {"name": "Lake MacLeod solné ložisko (Austrálie)", "lat": -24.250, "lon": 113.670, "ore": "halite", "status": "active", "reserves_t": 900000000, "radius": 18, "region": "Austrálie", "kind": "odparné solné ložisko"},
    {"name": "Grasberg Mine gigant mědi a zlata (Indonésie)", "lat": -4.055, "lon": 137.114, "ore": "ore_cu", "status": "active", "reserves_t": 2400000000, "radius": 24, "region": "Asie", "kind": "velehorský důl mědi"},
    {"name": "Bangka-Belitung cínová ložiska (Indonésie)", "lat": -2.500, "lon": 106.000, "ore": "ore_sn", "status": "active", "reserves_t": 450000000, "radius": 17, "region": "Asie", "kind": "naplavený a lomový cín"},

    # =========================================================================
    # --- AFRIKA ---
    # =========================================================================
    {"name": "Witwatersrand Basin hlubinné zlato (JAR)", "lat": -26.204, "lon": 28.047, "ore": "ore_au", "status": "active", "reserves_t": 75000000, "radius": 20, "region": "Afrika", "kind": "nejhlubší zlatý revír"},
    {"name": "Katanga Copperbelt měď (Kongo)", "lat": -11.660, "lon": 27.480, "ore": "ore_cu", "status": "active", "reserves_t": 1800000000, "radius": 22, "region": "Afrika", "kind": "bohatý měděný pás"},
    {"name": "Sishen železo a křemen (JAR)", "lat": -27.733, "lon": 22.998, "ore": "quartz", "status": "active", "reserves_t": 950000000, "radius": 18, "region": "Afrika", "kind": "povrchový lom"},
    {"name": "Boké Bauxite největší bauxit světa (Guinea)", "lat": 10.932, "lon": -14.295, "ore": "bauxite", "status": "active", "reserves_t": 2000000000, "radius": 24, "region": "Afrika", "kind": "obří ložisko bauxitu"},
    {"name": "Sangarédi bauxit (Guinea)", "lat": 11.100, "lon": -13.900, "ore": "bauxite", "status": "active", "reserves_t": 900000000, "radius": 19, "region": "Afrika", "kind": "bauxitový lom"},
    {"name": "Taoudenni kamenná sůl Sahara (Mali)", "lat": 22.678, "lon": -3.980, "ore": "halite", "status": "active", "reserves_t": 150000000, "radius": 12, "region": "Afrika", "kind": "saharské solné desky"},
    {"name": "Moatize uhelná pánev (Mosambik)", "lat": -16.117, "lon": 33.733, "ore": "coal", "status": "active", "reserves_t": 1200000000, "radius": 19, "region": "Afrika", "kind": "uhelný revír"},

    # =========================================================================
    # --- ASIE ---
    # =========================================================================
    {"name": "Oyu Tolgoi měď a zlato (Mongolsko)", "lat": 43.007, "lon": 106.848, "ore": "ore_cu", "status": "active", "reserves_t": 1600000000, "radius": 20, "region": "Asie", "kind": "obří měděný komplex"},
    {"name": "Erdenet měď a křemen (Mongolsko)", "lat": 49.030, "lon": 104.090, "ore": "ore_cu", "status": "active", "reserves_t": 750000000, "radius": 17, "region": "Asie", "kind": "měděný povrchový lom"},
    {"name": "Kuzbass uhelná pánev (Sibiř Rusko)", "lat": 54.340, "lon": 86.420, "ore": "coal", "status": "active", "reserves_t": 2200000000, "radius": 25, "region": "Asie", "kind": "sibiřská uhelná pánev"},
    {"name": "Norilsk Talnakh měď a kovy (Sibiř Rusko)", "lat": 69.350, "lon": 88.200, "ore": "ore_cu", "status": "active", "reserves_t": 1300000000, "radius": 21, "region": "Asie", "kind": "arktický těžební kombinát"},
    {"name": "Muruntau povrchové zlato (Uzbekistán)", "lat": 41.498, "lon": 64.571, "ore": "ore_au", "status": "active", "reserves_t": 95000000, "radius": 18, "region": "Asie", "kind": "největší povrchové zlato"},
    {"name": "Bayan Obo křemen a fluorit (Vnitřní Mongolsko)", "lat": 41.798, "lon": 109.969, "ore": "fluorspar", "status": "active", "reserves_t": 800000000, "radius": 18, "region": "Asie", "kind": "obří fluoritové ložisko"},
    {"name": "Shendong uhelné pole (Čína)", "lat": 39.300, "lon": 110.150, "ore": "coal", "status": "active", "reserves_t": 3500000000, "radius": 28, "region": "Asie", "kind": "největší uhelný důl světa"},
    {"name": "Dexing měděný lom (Čína)", "lat": 28.950, "lon": 117.700, "ore": "ore_cu", "status": "active", "reserves_t": 950000000, "radius": 18, "region": "Asie", "kind": "největší lom mědi v Číně"},
    {"name": "Khewra himalájská sůl (Pákistán)", "lat": 32.650, "lon": 73.010, "ore": "halite", "status": "active", "reserves_t": 600000000, "radius": 15, "region": "Asie", "kind": "himalájský solný důl"},
    {"name": "Reko Diq volné ložisko mědi a zlata (Pákistán)", "lat": 28.980, "lon": 62.240, "ore": "ore_cu", "status": "free", "reserves_t": 5900000000, "radius": 28, "region": "Asie", "kind": "obří volné rudné ložisko"},
    {"name": "Tampakan volné ložisko mědi a zlata (Filipíny)", "lat": 6.470, "lon": 125.040, "ore": "ore_cu", "status": "free", "reserves_t": 2900000000, "radius": 22, "region": "Asie", "kind": "volné ložisko mědi"},
    {"name": "Wafi-Golpu volné ložisko mědi (Papua-Nová Guinea)", "lat": -6.880, "lon": 146.470, "ore": "ore_cu", "status": "free", "reserves_t": 1000000000, "radius": 17, "region": "Asie", "kind": "volné podzemní ložisko"},
    {"name": "Kvanefjeld volné ložisko fluoritu (Grónsko)", "lat": 60.980, "lon": -46.000, "ore": "fluorspar", "status": "free", "reserves_t": 1000000000, "radius": 18, "region": "Evropa", "kind": "arktické volné ložisko"},
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
    dy_km = (lat - center_lat) * 111.0
    dx_km = (lon - center_lon) * 111.0 * math.cos(math.radians(center_lat))
    x = int(round(dx_km / scale_km_per_tile))
    y = int(round(-dy_km / scale_km_per_tile))
    return x, y

def build_scenario_map(
    center_lat: float = 50.5,
    center_lon: float = 14.0,
    scale_km_per_tile: float = 0.5,
    mines: Optional[List[dict]] = None
) -> List[dict]:
    """Vytvoří seznam ložisek pro herní mapu s reálnými rozestupy a odhadem zásob."""
    source_mines = mines or FAMOUS_GLOBAL_MINES
    result = []
    for idx, m in enumerate(source_mines):
        gx, gy = geo_to_grid(m["lat"], m["lon"], center_lat, center_lon, scale_km_per_tile)
        ore_key = m.get("ore", "quartz")
        oi = ORE_NAME_MAP.get(ore_key, 1)
        res_t = int(m.get("reserves_t", 50000000))
        status = m.get("status", "active")
        result.append({
            "id": f"dep_{idx}",
            "name": m["name"],
            "lat": m["lat"],
            "lon": m["lon"],
            "x": gx,
            "y": gy,
            "ore": ore_key,
            "ore_index": oi,
            "status": status,
            "status_label": "Aktivní těžba" if status == "active" else "Volné ložisko",
            "radius": m.get("radius", 8),
            "reserves_t": res_t,
            "reserves_est": fmt_reserves(res_t),
            "region": m.get("region", "Svět"),
            "kind": m.get("kind", "ložisko nerostů"),
        })
    return result

def download_usgs_mrds(
    commodity: str = "copper",
    bbox: Optional[Tuple[float, float, float, float]] = None
) -> List[dict]:
    """Stáhne ložiska z veřejného USGS MRDS rozhraní nebo vrátí kurátorská geodata."""
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
                    "status": "free",
                    "reserves_t": 100000000,
                    "radius": 10,
                    "region": "USGS Data",
                    "kind": "průzkumné ložisko USGS",
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

def export_js_deposits(deposits: List[dict], filepath: str = "src/world_deposits.js"):
    """Vygeneruje JavaScript ES modul pro přímé načítání ve Web / Three.js 3D prostředí."""
    p = Path(filepath)
    p.parent.mkdir(parents=True, exist_ok=True)
    content = "// Vygenerováno z reálných světových a lokálních ložisek (aktivní doly i volná ložiska)\n"
    content += "export const WORLD_DEPOSITS = " + json.dumps(deposits, indent=2, ensure_ascii=False) + ";\n"
    with open(p, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"JS modul ložisek pro 3D Three.js vygenerován: {filepath}")
