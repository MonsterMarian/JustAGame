# Deník vývoje (Development Log) & Plán dalších kroků

Datum: **15. listopadu 2026**  
Projekt: **Make Your CPU**

---

## 1. Co bylo dnes uděláno

### A. Převod a modularizace do Pythonu (`make_your_cpu/`)
- Vytvořeno kompletní Python zázemí pro simulaci továrny, těžby a logistiky:
  - `make_your_cpu/catalog.py`: Kompletní katalog strojů, surovin, dílů a aut.
  - `make_your_cpu/world.py`: Generování terénu a integrace zemského povrchu a nadmořské výšky.
  - `make_your_cpu/importer.py`: Import a generování reálných ložisek z GIS / USGS a databází.
  - `make_your_cpu/sim.py`: Herní stav, směny, vylepšování budov, poruchy, finance a logistika.
  - `make_your_cpu/game.py` & `main.py`: Spustitelná aplikace v Pygame s 60 FPS simulací a plynulým ovládáním.
  - `tests/test_py_sim.py`: Automatizovaná testovací sada pro ověření simulace (`pytest`).

### B. Globální databáze dolů a volných ložisek s odhadem zásob
- Vytvořen importér a databáze 105 reálných lokalit v `data/world_deposits.json` a `src/world_deposits.js`.
- Zahrnuje jak **aktivní těžbu** (`[● AKTIVNÍ DŮL]`), tak **volná neotevřená ložiska** (`[✦ VOLNÉ LOŽISKO]`):
  - Velké světové doly (Bingham Canyon, Escondida, Kiruna, Pilbara, Chuquicamata, Grasberg, Witwatersrand, Salar de Uyuni...).
  - Malé i velké lokální lomy a pískovny v ČR a SR (Bílina, Most, Sokolov, Cínovec, Střeleč, Provodín, Kaznějov, Chlumčany, Mořina, Mokrá, Dobříň, Hulín, Tovačov...).
  - Všechny druhy komodit: uhlí, sklářský křemen, měď, cín, lithium, zlato, bauxit, kamenná sůl, kazivec/fluorit.
  - Přesné odhady zásob v tunách a čitelné formě (např. *14,5 Mt*, *850 kt*, *1,9 Gt*).
- Implementován prostorový index ($O(1)$ spatial hashing) v `src/world.js` pro bleskové vzorkování terénu bez záseků.

### C. 3D LOD (Level of Detail) & Frustum/Distance Culling
- Plnohodnotná 3D grafika v Three.js v `src/world3d.js` optimalizovaná pro velké mapy:
  - **Při velkém oddálení (zoom out)**: Mikroobjekty (krabičky na pásech, směrové šipky, mikroanimace, kouř z komínů a cedulky strojů) se automaticky zahazují. Zobrazují se výrazné 3D majáky s billboard cedulkami jednotlivých světových dolů a ložisek s odhadem zásob.
  - **Při přiblížení (zoom in)**: Vzdálené bloky terénu a stroje mimo zorné pole kamery se ořezávají (distance culling). Blízká továrna a detaily běží v plné plynulosti.
  - **Přelet k dolu**: Kliknutím na libovolnou 3D značku ložiska kamera plynule přeletí přímo k dané lokalitě.
  - **Plynulý zoom**: Rozšířen rozsah oddálení až do výšky 1 200 m pro celkový přehled o kontinentech a těžebních revírech.

### D. Přejíždění bagrů a těžební logistika
- Implementována logika přejíždění bagrů do jiného ložiska po vytěžení původního místa (jak v Python simulaci, tak ve webovém UI).
- Umožněna stavba polního skladu (`dump`) hned vedle dolu pro separaci hlušiny a plynulý odvoz nerostů.

### E. 5 úrovní vylepšení budov a moduly
- Přidáno 5 úrovní vylepšení strojů se zrychlením a úsporami.
- 3 typy specializovaných modulů budov (`auto` automatizace, `cool` chlazení, `cap` rozšíření zásobníku).
- Možnost povýšení (evoluce) strojů na vyšší modelové řady.

---

## 2. Co je potřeba udělat dále (Plán rozvoje)

1. **Dálková přeprava a železnice / pásové dálkovody**:
   - Vzhledem k velkým reálným vzdálenostem mezi ložisky (desítky až stovky km) implementovat železniční tratě, nákladní vlaky a těžké transportní soupravy.
2. **Globální minimapa / satelitní atlas světa**:
   - Přidat interaktivní přepínatelnou mapu celého světa přímo do postranního panelu pro rychlé skákání mezi jednotlivými těžebními závody.
3. **Průzkumné licence a geologické aukce**:
   - Hratelnostní mechanika pro volná ložiska: možnost zakoupit těžební licenci / provést geologický průzkum vrtem před zahájením těžby.
4. **Autonomní fleet management strojů**:
   - Přehledné rozhraní pro správu a automatické přesuny flotily těžebních strojů a náklaďáků podle poptávky továren.
5. **Plné 3D zobrazení v Python desktop klientu**:
   - Rozšířit Python desktop verzi o 3D zobrazení (např. pomocí moderngl / Panda3D / PyOpenGL) sjednocené s Three.js verzí.

---

## 3. Stav verifikace
- **JavaScript testy (`npm test`)**: 32/32 testů prošlo (100 %).
- **Python testy (`pytest tests/test_py_sim.py`)**: 5/5 testů prošlo (100 %).
- **Syntaxe**: `node --check` ověřena bez chyb.
