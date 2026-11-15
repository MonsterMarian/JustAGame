# MAKE YOUR CPU

Tovární hra v otevřeném 3D světě (Electron, čistý JavaScript, three.js). Začínáš s ručním lomem, polní cestou, starým
pick-upem a malou sklárnou a končíš s vlastním fabem, EUV skenerem a procesorem z křemene, který sis sám vytěžil.
Stroje, výrobní postupy a ceny vycházejí ze skutečnosti; u každé ceny je ve hře napsáno, jestli je **doložená** zdrojem, nebo **odhad**.

## Spuštění
- Dvojklik na `Spustit_hru.bat` (při prvním spuštění si sám doinstaluje závislosti).
- Nebo ručně: `npm install`, `node node_modules/electron/install.js` (stáhne Electron, když chybí) a `npm start`.
- Testy simulace: `npm test`.
- Přenosné `.exe` pro Windows: `npm run dist` (vznikne v `dist/`). Po pushnutí tagu `v*` (`git tag v0.2.0`, `git push --tags`) ho GitHub
  sestaví sám a přiloží k vydání v Releases. Testy běží na GitHubu při každém pushi.

Hra se ukládá sama každých 30 s a při zavření (Ctrl+S ukládá hned).

## Hlavní menu a úrovně
Hra začíná hlavním menu: **Pokračovat** (rozehraná hra), **Výuka**, **Úrovně a volná hra**, **Pískoviště** (vše odemčeno,
peníze bez omezení), přehled ovládání a Konec. Zpět do něj vede Menu (Esc) → Hlavní menu.

Úrovně fungují jako sektory v Mindustry: každá něco učí, má cíle vypsané vlevo nahoře (splněný se odškrtne) a splněná
odemkne další. Po splnění jde hrát dál, nebo přejít na další úroveň.

1. **První uhlí** (výuka): průvodce krok za krokem. Cíle: vytěžit 10 t uhlí, přidat lomu druhou směnu a poprvé odemknout něco ve Stromu.
2. **Mechanizace**: Minirypadlo, 30 m štěrkové cesty, 300 t vytěženého uhlí nebo křemene, 60 000 $ na účtu.
3. **Sklářská dílna**: pánvová pec, 5 balení foukaného skla, 100 000 $ na účtu.
4. **Dílna elektroniky**: začíná s dílnou a linkou; první Arduino, výměna osazovacího automatu, 20 balení Arduina.
5. **Volná hra**: celý strom rozvoje bez cíle, vedou ji úkoly.

## Jak se hraje
Výuka (první úroveň) má průvodce (8 kroků): uhlí, cesta do Skladu, hlušina, druhá směna, strom rozvoje. Karta vlevo nahoře říká, co udělat teď, šipka ve světě ukazuje kde a tlačítko, na které
se má kliknout, pulzuje. Jde přeskočit.

1. **Co těžit a kam to vozit**: všechno se vozí do **Skladu**. Začínáš jen s ním a s 15 000 $ (herní hodnota). Dvě ložiska
   u startu mají v mapě popisek: černé uhlí (s ním se začíná) a křemen.
2. **Lom a cesta**: Ruční lom polož na ložisko. Pak vyber Polní cestu, klikni na lom a klikni na Sklad: cesta mezi
   nimi se navrhne sama (rovně, kolem budov; délku a cenu vidíš u kurzoru) a druhým klikem se postaví. **Auta se
   kupují sama**: jakmile cesta vede, první auto se koupí za svou cenu, a když hromada roste, přibudou další (nejvýš 4),
   ale jen tehdy, když po nákupu zůstane aspoň tolik peněz, kolik auto stálo. Za každý ujetý kilometr se platí nafta a servis.
   Lepší auto ze Stromu se vymění samo za doplatek rozdílu; při zbourání dolu se auta prodají za cenu nákupu. **Cíl si auto vybírá
   před každou jízdou**: nejdřív vlastní výroba, která má na surovinu místo (počítá se i to, co k ní už jede), jinak
   nejlépe platící sklad nebo odběratel. Plná pec tedy auta nezdrží, jedou jinam; když není kam, čekají u lomu.
   V panelu lomu jde cíl zvolit i ručně. Po silnici jezdí auta ze všech lomů společně: drží pravý pruh, jedou za sebou
   a stojící parkují v řadě vedle cesty.
   Sklad si nechává 20 t každé suroviny pro tvoje stroje a zbytek prodává, takže těžba vydělává i bez Sklárny.
3. **Vlastní Sklářská dílna** (40 000 $): postav ji těsně ke Skladu. Křemen a uhlí si z něj bere sama, z dávky 74 kg křemene
   utaví 100 kg skla a skláři z něj vyfoukají zboží, které jde rovnou do Skladu a samo se prodá. Když Sklárna stojí jinde, stačí k ní dovést
   cestu: auta jí suroviny vozí sama a sklo odvezou taky.
4. **Zásoby a limity jsou vidět nad každým dolem a pecí**: u dolu „černé uhlí: zbývá 761 t · hromada 10/40“, u pece
   „křemen 17/18 · černé uhlí 5/6 → sklo 0/40“. Když budova stojí, je nad tím růžově důvod: „chybí: černé uhlí“,
   „plno: odběr má dost, veď cestu i do Skladu“, „chybí cesta: není kam vozit“.
   Nahoře v liště jsou peníze, příjem a výdaje za den, body rozvoje a čtyři nejcennější zásoby Skladu.
5. **Lidé, vylepšení a výměna stroje**: v panelu budovy přidáváš a ubíráš zaměstnance. Doly, pece a elektrárny začínají na
   jedné směně, výrobní stroje v halách na třech (jeden člověk na směnu, jedou nepřetržitě). Výkon stroje je
   udaný za hodinu práce; jedna směna pracuje 8 hodin denně, tři směny nepřetržitě. Mzda je za osmihodinovou směnu a platí
   se jen za dny, kdy budova pracuje. Tlačítko Vylepšit zvedne úroveň
   (až o tři, každá přidá polovinu základního výkonu). Lepší stroj téhož druhu a stejné velikosti jde položit přímo přes
   starý (nebo tlačítkem Vyměnit): platí se rozdíl a hromada, cesty i auta zůstanou.
   Po vzoru Mindustry ukazuje panel i bublina při najetí myší **pruhy se stavem**: rychlost těžby, hromada z kapacity,
   zásoba ložiska, vstupy pece z limitu, postup tavby a lidé. Při pokládání lomu vidíš u kurzoru, co a jak rychle bude těžit.
6. **Silnice mají tři třídy**: polní cesta, štěrková cesta, asfalt. Po lepší jedou auta rychleji; horší cestu vylepšíš
   tak, že lepší vedeš mezi stejnými dvěma body (jde po staré trase) a zaplatíš jen rozdíl. Větší auta (sklápěč, dampr)
   se po odemčení ve Stromu vymění sama. Přes vodu vede silnice jako násep za desetinásobek. **Ve svahu je silnice dražší**
   (každé procento sklonu přidá desetinu ceny), návrh cesty proto kopce obchází, a **do kopce jedou auta pomaleji**.
7. Za tržby a úkoly přicházejí **body rozvoje**. Ve **Stromu rozvoje** (V) za ně odemykáš lepší silnice, větší auta,
   rypadla, vrty, doly a větší sklářskou pec, později elektroniku a čipy. Odemčené se kupuje za peníze. Zamčené stavby
   jsou ve stavebním menu vidět se zámkem; klik na ně otevře Strom na správném místě. Kdo chce místo aut dopravníky
   jako v Mindustry, odemkne si ve Stromu Pásové dopravníky: lom, který se dopravníku dotýká, na něj sype sám.
8. **Odběratelé** na mapě (tyrkysové čtverce v minimapě, seznam v okně Trh) platí za některé zboží víc než Trh:
   Stavebniny za sklo, Teplárna za uhlí, hutě za rudy. Zboží k nim vozí auta po silnici.
9. **Terén má kopce**: kolem Skladu je do 90 m rovina, dál se zvedá až o desítky metrů (skály nejvýš, voda v nule).
   Budova si terén pod sebou srovná, silnice a auta jedou po svahu. Haly jdou stavět jen na rovině.
   **S nerostem se kope i hlušina** (u křemene půl tuny na tunu, u uhlí tři): leží na hromadě u dolu a auta ji odvážejí
   stejně jako nerost, do Skladu nebo Stavebninám, kde se prodá jako kamenivo. Kdo ji neodváží, tomu zavalí hromadu.
10. Ložisko má **konečné zásoby** (30 t na m² u povrchu) a po těžbě zůstane v zemi **jáma**. Pod zemí je šest pater po 50 m:
   Průzkumný vrt ukáže, co v nich je, důl se k tomu prorazí. Tlačítko **Pod zem** (G) zprůhlední terén.
11. **Dílna elektroniky** ve Stromu postaví kolem Skladu halu s linkou pěti strojů na Arduino a spustí druhou část průvodce.
   Stroj, který trasu zahajuje, klikni a zvol výrobek; dávka pak projde stroji v pořadí kroků. Díly bere stroj ze Skladu,
   kterého se dotýká; hotové výrobky se ve Skladu samy prodají. Výrobní stroje stojí v **hale**.
12. Pro fab postav smyčku dopravníků a stroje kolem ní. Okno **Postupy** ukáže u každého výrobku kroky, stroje a jestli se vyplatí.
   **Chemie a plyny pro fab** (rezist, plyny, suspenze, terče) jsou zboží ve Skladu: stroje fabu si je berou centrálním rozvodem
   (jako ve skutečném fabu potrubím), ne po dopravníku. Po odemčení Garážového fabu je Sklad sám dokupuje na zásobu 10 balení
   (jde změnit v Trhu, záložka Spotřební); když dojdou, fab stojí s hláškou „chybí: chemie a plyny“.
13. **Poruchy a údržba**: každý stroj se po odpracovaných hodinách porouchá (v průměru po 500 h práce), oprava trvá 8 h a stojí 2 % ceny stroje.
   V panelu stroje jde najmout údržbáře (mzda jednoho člověka za každou odpracovanou směnu): s ním jsou poruchy třikrát řidší.
   Kdy přesně se stroj porouchá, určuje jeho místo na mapě, takže stejná hra má stejné poruchy.
14. **Uhelná teplárna** (Strom, Těžba): z uhlí dělá proud, 1 MW nebo 20 MW. Stroje berou elektřinu nejdřív ze zásobníku vlastních
   elektráren (20 MWh), zbytek kupují ze sítě; přebytek nad zásobník se prodává do sítě. Uhlí jí vozí auta nebo si ho bere ze Skladu.
15. **Zakázky**: odběratel na mapě občas pošle zakázku na zboží, které už umíš vyrobit (karta vlevo nahoře): dovez do tří dnů dané
   množství a k ceně dostaneš prémii 30 % a bod rozvoje. Nesplněná zakázka jen propadne; další přijde za den. Ve výuce zakázky nechodí.
16. **Statistiky** (I): průběh peněz, příjmů a výdajů za poslední dva týdny, co se za poslední den vyrobilo a které stroje a doly
   zrovna stojí a proč (s tlačítkem Ukázat).

**Kdy stavím a kdy ne**: pruh nad stavebním menu říká Prohlížíš / Stavíš / Bouráš. Při stavění má okno jantarový rámeček,
kurzor je kříž a u něj visí štítek se jménem stavby; při bourání je vše červené. Při prohlížení se budova pod kurzorem
orámuje bíle a kurzor se změní na ručičku. Esc nebo pravé tlačítko stavění ukončí.

Ovládání pohledu: tažení levým tlačítkem, WASD nebo najetí myší na okraj okna (posun); tažení **pravým nebo prostředním
tlačítkem**, Shift + levé, nebo tažení za **kompas** vlevo dole (otočení a náklon na kteroukoli stranu); Q / E (plynulé
otáčení); kolečko (přiblížení k místu pod kurzorem); dvojklik (přelet na místo); klik na střechu (vstup do haly);
H (zpět do dílny); G (pod zem). Vlevo dole jsou i tlačítka ⟲ ⟳ Shora, Šikmo, Nízko.
Stavění: R (otočit stavbu), F (vzít stavbu pod kurzorem), X (bourat), pravé tlačítko nebo Esc (zrušit).
Ostatní: mezerník a 1–4 (pauza a rychlost), V / M / C / P / I (Strom, Trh, Čipy, Postupy, Statistiky).
Silnice se staví dvěma kliky (začátek a konec, jde i tažením), dopravník tažením, hala a čistý prostor tažením obdélníku.

## Co ve hře je
- **114 strojů** podle skutečných předloh ve třech třídách: dílna (Hacker Fab, LumenPnP, Bungard…), repasované 200mm stroje
  (ASML PAS 5500, AMAT P5000, TEL ACT 8…) a nové 300mm stroje (ASML NXT:2000i, NXE:3600D, EXE:5000, Lam Kiyo…).
  Půdorys odpovídá skutečným rozměrům, 1 dlaždice = 1 m.
- **80 výrobních tras**: elektřina z uhlí, foukané a obalové sklo, osazování desek, výroba DPS, 10 druhů pasivních součástek a mechaniky, pouzdření
  (keramické DIP, drátky, flip-chip, CoWoS + HBM2), výroba na waferu (10 µm až 5 nm EUV, DRAM, V-NAND, výkonové MOSFETy),
  křemík (křemen → metalurgický křemík → polykřemík → ingot → wafer).
- **18 čipů**: Intel 4004, 6502, 8080, 8086, NVIDIA NV1, GM107, GP100, GA104, Xeon E5-1650 v3, Core i7-9700, B360,
  DDR4, GDDR6X, HBM2, V-NAND, Ryzen 7 7700X… Počet čipů na waferu a výtěžnost se počítají z plochy čipu a hustoty defektů;
  výtěžnost roste s počtem zpracovaných waferů.
- **Výrobky** z tvých projektů: Diamond Edge 3D 2120, Quadro K620, Tesla P100, RTX 3060 Ti, PRIME B360-PLUS, RAM, SSD,
  sestavy MŮJ PC a AI PC 2× P100. K tomu Arduino Uno R3 na rozjezd.
- Nekonečná 3D mapa s osmi nerosty na povrchu i v šesti patrech pod zemí, 9 odběratelů, 3 třídy silnic, 3 auta,
  strom rozvoje s 38 položkami v pěti větvích, 4 úrovně s cíli a volná hra s 22 úkoly, trh s nasycením (víc prodaných kusů = nižší cena).
- Stroje ve světě i v panelu stroje jsou **tvoje parametrické 3D modely** ze Silicon Logic Studia, zmenšené na půdorys stroje
  (stolní stroje stojí na stole). Těžba, hutě a montáž model v rešerši nemají, tam jsou jednoduché vlastní tvary.

## Vzhled
Svět: filmové mapování tónů, obloha s přechodem, lesy z nízkopolygonových stromů, balvany na skalách a ložiska jako kusy nerostu
v barvě suroviny (ubývají s těžbou). Budovy a auta mají jednu paletu (světlé stěny, břidlicové střechy, oranžová jako barva hráče)
a jsou poskládané z detailů: Sklad s rampou, paletami a vysokozdvižným vozíkem, ruční lom s boudou a dvěma dělníky, sklářská dílna
s cihlovou pecí, rypadlo s drtičem, důl s těžní věží. Odběratele poznáš podle dvora: stavebniny mají hromady kameniva, elektrárna
chladicí věž a uhlí, hutě ingoty v barvě kovu, chemička nádrže. Tři typy aut se liší tvarem i barvou (červený pick-up, modrý valník,
žlutý dampr). Rozhraní: poloprůhledné zaoblené panely nad světem, oranžová jako jediný akcent, nadpisy a čísla
písmem Bahnschrift (písmo továrních a dopravních cedulí). Styly redesignu jsou na konci `style.css` jako vrstva nad staršími pravidly.

## Podle reality
Těžba a první výroba běží na číslech z rešerše (`data/research/realism.json`, 15. 11. 2026); ve hře je u každého štítek DOLOŽENO nebo ODHAD a odkaz na zdroj.

| Co | Hodnota | Původ |
|---|---|---|
| Ruční lom, 2 lidé | 0,52 t za hodinu práce, nářadí 480 $ | odhad z normy ILO (0,8 m³ skály na dělníka a směnu) |
| Minirypadlo Kubota U17-3 | 9 t za hodinu práce | odhad z prospektu (lžíce 0,04 m³, cyklus 15 s) |
| Cat 320 + drtič Metso C106 | 167,5 t/h | doloženo (brožura Metso) |
| Sklářská dílna, pánvová pec 200 lb | 40 000 $, 90 kg skla za směnu | cena doložená (Spiral Arts), výkon odhad |
| Vanová pec na obalové sklo | 12,1 mil. $, 80 t denně | doloženo (Glass International 2023) |
| Vsázka na 1 t skla | 740 kg křemene, 222 kg sody, 187 kg vápence, 6,5 GJ | odhad ze složení skla a EU BREF |
| Ploché sklo | 160 $/t | doloženo (čínský statistický úřad, 10/2026) |
| Soda 159 $/t, vápenec 18,5 $/t | | doloženo (USGS) |
| Křemen 47 $/t, redukční uhlí 200 $/t, energetické uhlí 145 $/t | | doloženo (SMM, Trading Economics) |
| Mzda za osmihodinovou směnu | 221 $ | doloženo (BLS/O*NET, USA, obsluha rýpadel) |
| Polní cesta 15 $/m, štěrková 66 $/m, asfaltová 278 $/m | | odhady z cen za míli (TRL, ARDOT) |
| Pick-up 3 620 $, sklápěč 25 308 $, Volvo A30G 393 000 $ | | doložené inzeráty a ceníky |
| Nafta | 6,127 $ za galon (1,62 $/l) | doloženo (EIA, průměr USA 9. 11. 2026) |
| Spotřeba aut | pick-up 12, sklápěč 25, dampr 90 l na 100 km; servis 0,12 / 0,30 / 1,50 $ za km | odhad bez zdroje |
| Uhelný blok | 10 647 Btu na kWh (11,2 GJ na MWh) | doloženo (EIA, Electric Power Annual 2025, tab. 8.1) |
| Výhřevnost černého uhlí | 24 GJ/t, tedy 0,47 t uhlí na MWh | odhad bez zdroje |
| Teplárna 1 MW 4 mil. $, elektrárna 20 MW 60 mil. $ | | odhady bez zdroje (3 000–4 000 $ za kW) |
| Elektřina ze sítě | 8,51 ¢/kWh | doloženo (EIA, průmysl 2025) |
| Výkup přebytku do sítě | 40 $ za MWh | odhad bez zdroje |

Co z toho plyne ve hře: směna pracuje 8 hodin denně; ruční těžba křemene se s americkou mzdou nevyplatí (4 t za směnu po 47 $ proti
442 $ mezd), uhlí ano. Proto výuka začíná uhlím. Sklářská dílna je řemeslo: 90 kg skla za směnu, které se prodává jako foukané
sklo (cena 10 $/kg je odhad bez zdroje), ne jako plavené sklo po 160 $ za tunu.

## Odkud jsou data
- `data/hw/` je kopie tvé rešerše z `HW/silicon-logic-studio/src/web/fab/` (stroje, postupy, materiály, 3D modely strojů).
  Popisy kroků, výrobci, závody a odkazy na zdroje ve hře pocházejí odtud.
- `data/research/*.json` je rešerše cen z 14. 11. 2026 (stroje, materiály, čipy, výrobky; 214 položek, 91 doložených).
  `node tools/merge-research.mjs` z ní vyrobí `data/prices.js`, který čte katalog. Co rešerše nenašla, zůstává odhadem.
- `data/catalog.js` (stroje, položky, čipy) a `data/routes.js` (trasy, výzkum, úkoly) jsou herní vrstva nad těmito daty.

## Co je zjednodušené nebo herní hodnota
- Trasa je pořadí strojů z rešerše; vrstvy kovu se opakují, ale skutečný proces má stovky kroků, tady desítky až sto.
- Tři průměry waferů (100, 200, 300 mm). Lot je 25 waferů, v dílně 5. Položky jsou v baleních (100 ks, kotouč, lot).
- Čas: 1 herní hodina = 6 s. Výkon strojů je ze specifikací, kde jsou; jinak odhad.
- Spotřební materiál je mimo fab náklad na krok, ne položka na skladě; ve fabu je to jedno balení „chemie a plyny“ za 1 000 USD
  (herní hodnota) a kolik ho který krok spotřebuje, je herní odhad. Elektřina se platí jen při práci stroje. Výrobní stroj v hale obsluhuje
  jeden člověk na směnu (odhad); mzda je stejná jako v těžbě.
- Poruchy (průměrně po 500 h práce), doba opravy 8 h, cena opravy 2 % ceny stroje a účinek údržbáře (třikrát řidší poruchy) jsou herní hodnoty.
- Svah: přirážka k ceně silnice (10 % ceny za každé procento sklonu) i zpomalení aut do kopce (10% stoupání skoro na polovinu) jsou herní hodnoty.
  Skrývkové poměry (hlušina na tunu nerostu) a cena hlušiny jsou odhady bez zdroje.
- Zásobník proudu 20 MWh, velikost zakázek, prémie 30 % a termín tři dny jsou herní hodnoty. Elektrárna spotřebu vlastního provozu nepočítá.
  Auto se dokupuje, jen když po nákupu zůstane aspoň tolik peněz, kolik stálo (herní pravidlo, aby nákup aut nevyčerpal pokladnu).
- Cíle úrovní a to, s čím která úroveň začíná, jsou herní hodnoty. Počty lidí na směnu jsou odhady; ceny a účinek úrovní vylepšení jsou herní hodnoty.
- Z Mindustry (GPL-3.0) jsou převzaté jen mechaniky (pruhy se stavem, náhled výkonu při pokládání, výměna bloku za lepší), žádný kód ani grafika.
- Auta v jednom pruhu se nepředjíždějí; když jedno čeká déle než 6 s, další ho projede (pojistka proti zaseknutí).
- Hloubka trhu, ceny ve stromu rozvoje (body) i tempo, kterým body přicházejí, a ceny sestav PC jsou herní hodnoty.
  Herní hodnoty jsou i rychlost aut (5, 9 a 14 m/s podle třídy silnice, stejně jako rychlost dopravníku nesedí s herním časem),
  výkon ručního lomu a malé sklárny, receptura skla (0,75 t křemene + 0,25 t uhlí na tunu; soda a vápenec jsou náklad 90 USD na tunu),
  rozmístění odběratelů a jejich násobky cen. Cena skla a sklářských pecí je odhad bez zdroje. Suroviny se na Trhu koupit nedají, těží se. Ceny silnic jsou odhady bez zdroje. Auta nemají řidiče (mzda se za ně neplatí)
  a jsou nakreslená menší než ve skutečnosti, aby se vešla na metrovou dlaždici.
  Zásoba 20 t, kterou si Sklad nechává, je herní hodnota. Totéž zásoby ložisek, rozmístění nerostů pod zemí,
  cena a rychlost ražby dolu (rychlost je proti skutečnosti asi osmkrát vyšší) a ceny vrtné soupravy a vybavení dolu (odhady bez zdroje).
  Jáma po rypadle je vždy 10 m hluboká se svislými stěnami a pohled pod zem má svislé měřítko 1 : 4, aby se 300 m hloubky vešlo do záběru. Garážový postup 10–3 µm a proces 5 nm jsou sepsané podle veřejných popisů, ne z tvé rešerše.
- Ceny jsou z různých let (výrobky za cenu při uvedení, díly za dnešní ceny distributorů), takže některé výrobky se
  z kupovaných dílů nevyplatí a vydělávají až s vlastními díly. Okno Postupy to u každé trasy ukazuje.

## Struktura
```
electron/main.js   okno aplikace
index.html, style.css
src/sim.js         simulace (stav, stavění, dopravníky, stroje, trh) – bez DOM, testovaná
src/world.js       terén a ložiska ze šumu
src/world3d.js     3D pohled na svět (terén, haly, stroje, dopravníky)
src/render.js, sprites.js   textury terénu, minimapa, ikony
src/ui.js          panely a ovládání
src/viewer3d.js    3D náhled stroje
data/              katalog, trasy, rešerše
tests/             node --test
tools/shot.cjs     snímky hry ze skrytého okna: electron tools/shot.cjs kroky.json složka
tools/builder-include.cjs   pro electron-builder: přibalí doplňky three.js (složku examples)
.github/workflows/ testy při pushi, .exe do Releases při tagu v*
```
