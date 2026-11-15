"""Grafická desktopová hra v pygame-ce s plynulým pohledem na svět,
reálnou mapou světa, zobrazením ložisek, minimapou a vizualizací přejíždějících bagrů.
"""
import sys
import math
import json
from pathlib import Path
from typing import Optional, Tuple, List, Dict
import pygame

from .sim import Sim, upgrade_cost, mod_cost, MODS, ORES, reach_of, pile_of
from .world import T_WATER, T_SAND, T_GRASS, T_DRY, T_ROCK
from .catalog import MODELS, ITEMS

# Paleta barev
C_BG = (12, 18, 28)
C_WATER = (30, 68, 125)
C_WATER_DEEP = (18, 42, 85)
C_SAND = (205, 185, 125)
C_GRASS = (46, 102, 50)
C_DRY = (160, 140, 75)
C_ROCK = (105, 108, 118)
C_HQ = (45, 135, 230)
C_MINER = (235, 155, 35)
C_MOVING_MINER = (255, 215, 60)
C_TEXT = (240, 240, 235)
C_DIM = (145, 155, 170)
C_AMBER = (255, 175, 45)
C_GREEN = (55, 210, 115)
C_PANEL = (16, 22, 32)
C_PANEL_BORDER = (40, 54, 74)

ORE_COLORS = {
    1: (240, 235, 225),  # quartz
    2: (40, 44, 50),     # coal
    3: (215, 125, 55),   # copper
    4: (195, 85, 55),    # bauxite
    5: (245, 205, 215),  # salt
    6: (165, 115, 230),  # fluorite
    7: (145, 150, 165),  # tin
    8: (250, 195, 55),   # gold
}

ORE_NAMES = {
    1: "Křemen",
    2: "Černé uhlí",
    3: "Měď",
    4: "Bauxit",
    5: "Sůl",
    6: "Fluorit",
    7: "Cín / Lithium",
    8: "Zlato",
}

FAST_TRAVEL_SPOTS = [
    {"label": "🇨🇿 ČR & Střední Evropa", "key": "H", "x": 0, "y": -35, "zoom": 10.0},
    {"label": "⛏️ Mostecká pánev (Uhlí)", "key": "1", "x": -61, "y": -57, "zoom": 16.0},
    {"label": "💎 Střeleč (Křemen)", "key": "2", "x": 50, "y": -56, "zoom": 16.0},
    {"label": "⚙️ Cínovec (Cín / Li)", "key": "3", "x": -52, "y": -81, "zoom": 16.0},
    {"label": "🇺🇸 Severní Amerika", "key": "4", "x": -8500, "y": 600, "zoom": 2.5},
    {"label": "🇨🇱 Jižní Amerika (Escondida)", "key": "5", "x": -5963, "y": 8244, "zoom": 2.5},
    {"label": "🇦🇺 Austrálie (Pilbara)", "key": "6", "x": 7504, "y": 8143, "zoom": 2.5},
    {"label": "🇿🇦 Afrika (Witwatersrand)", "key": "7", "x": 967, "y": 8459, "zoom": 2.5},
    {"label": "🌍 Pohled na celou Zemi", "key": "W", "x": 0, "y": 2500, "zoom": 0.8},
]

class GameApp:
    """Hlavní desktopová aplikace pro MakeYourCPU."""

    def __init__(self, sim: Optional[Sim] = None, width: int = 1280, height: int = 800):
        pygame.init()
        pygame.display.set_caption("MakeYourCPU — Reálná mapa světa a ložisek nerostů (Python Desktop)")
        self.width = width
        self.height = height
        self.screen = pygame.display.set_mode((width, height), pygame.RESIZABLE)
        self.clock = pygame.time.Clock()

        self.font_sm = pygame.font.SysFont("Segoe UI, Arial, sans-serif", 12)
        self.font = pygame.font.SysFont("Segoe UI, Arial, sans-serif", 14)
        self.font_bold = pygame.font.SysFont("Segoe UI, Arial, sans-serif", 15, bold=True)
        self.font_title = pygame.font.SysFont("Segoe UI, Arial, sans-serif", 18, bold=True)

        self.sim = sim or Sim(seed=4)

        # Výchozí poloha kamery: ČR / Střední Evropa s Mostem a Střelčí na dohled
        self.cam_x = 0.0
        self.cam_y = -35.0
        self.zoom = 10.0  # pixelů na dlaždici (1 dlaždice = 1 km)
        self.dragging = False
        self.drag_start = (0, 0)
        self.selected: Optional[dict] = None
        self.tool: Optional[str] = None
        self.running = True
        self.hover_deposit: Optional[dict] = None

    def world_to_screen(self, wx: float, wy: float) -> Tuple[int, int]:
        sx = int(self.width / 2 + (wx - self.cam_x) * self.zoom)
        sy = int(self.height / 2 + (wy - self.cam_y) * self.zoom)
        return sx, sy

    def screen_to_world(self, sx: int, sy: int) -> Tuple[int, int]:
        wx = int(math.floor(self.cam_x + (sx - self.width / 2) / self.zoom))
        wy = int(math.floor(self.cam_y + (sy - self.height / 2) / self.zoom))
        return wx, wy

    def handle_events(self):
        mouse_pos = pygame.mouse.get_pos()
        for e in pygame.event.get():
            if e.type == pygame.QUIT:
                self.running = False
            elif e.type == pygame.VIDEORESIZE:
                self.width, self.height = e.w, e.h
                self.screen = pygame.display.set_mode((e.w, e.h), pygame.RESIZABLE)
            elif e.type == pygame.MOUSEBUTTONDOWN:
                # Kliknutí na rychlé skoky v levé liště
                if 12 <= e.pos[0] <= 210 and 50 <= e.pos[1] <= 50 + len(FAST_TRAVEL_SPOTS) * 26:
                    idx = (e.pos[1] - 50) // 26
                    if 0 <= idx < len(FAST_TRAVEL_SPOTS):
                        spot = FAST_TRAVEL_SPOTS[idx]
                        self.cam_x = float(spot["x"])
                        self.cam_y = float(spot["y"])
                        self.zoom = float(spot["zoom"])
                        return

                if e.button == 1:  # Levé tlačítko
                    if e.pos[0] < self.width - 290 and e.pos[1] > 40 and e.pos[1] < self.height - 60:
                        wx, wy = self.screen_to_world(e.pos[0], e.pos[1])
                        if self.tool:
                            self.sim.place(self.tool, wx, wy)
                        else:
                            self.selected = self.sim.at(wx, wy)
                    self.dragging = True
                    self.drag_start = e.pos
                elif e.button == 3:  # Pravé tlačítko
                    self.tool = None
                    self.selected = None
                elif e.button == 4:  # Kolečko nahoru (zoom in)
                    self.zoom = min(50.0, self.zoom * 1.2)
                elif e.button == 5:  # Kolečko dolů (zoom out)
                    self.zoom = max(0.5, self.zoom / 1.2)
            elif e.type == pygame.MOUSEBUTTONUP:
                if e.button == 1:
                    self.dragging = False
            elif e.type == pygame.MOUSEMOTION:
                if self.dragging:
                    dx = e.pos[0] - self.drag_start[0]
                    dy = e.pos[1] - self.drag_start[1]
                    self.cam_x -= dx / self.zoom
                    self.cam_y -= dy / self.zoom
                    self.drag_start = e.pos
            elif e.type == pygame.KEYDOWN:
                if e.key == pygame.K_ESCAPE:
                    self.tool = None
                    self.selected = None
                elif e.key == pygame.K_h:
                    self.cam_x, self.cam_y, self.zoom = 0.0, -35.0, 10.0
                elif e.key == pygame.K_w:
                    self.cam_x, self.cam_y, self.zoom = 0.0, 2500.0, 0.8
                elif e.key in (pygame.K_1, pygame.K_KP1):
                    spot = FAST_TRAVEL_SPOTS[1]
                    self.cam_x, self.cam_y, self.zoom = spot["x"], spot["y"], spot["zoom"]
                elif e.key in (pygame.K_2, pygame.K_KP2):
                    spot = FAST_TRAVEL_SPOTS[2]
                    self.cam_x, self.cam_y, self.zoom = spot["x"], spot["y"], spot["zoom"]
                elif e.key in (pygame.K_3, pygame.K_KP3):
                    spot = FAST_TRAVEL_SPOTS[3]
                    self.cam_x, self.cam_y, self.zoom = spot["x"], spot["y"], spot["zoom"]
                elif e.key in (pygame.K_4, pygame.K_KP4):
                    spot = FAST_TRAVEL_SPOTS[4]
                    self.cam_x, self.cam_y, self.zoom = spot["x"], spot["y"], spot["zoom"]
                elif e.key in (pygame.K_5, pygame.K_KP5):
                    spot = FAST_TRAVEL_SPOTS[5]
                    self.cam_x, self.cam_y, self.zoom = spot["x"], spot["y"], spot["zoom"]
                elif e.key in (pygame.K_6, pygame.K_KP6):
                    spot = FAST_TRAVEL_SPOTS[6]
                    self.cam_x, self.cam_y, self.zoom = spot["x"], spot["y"], spot["zoom"]
                elif e.key in (pygame.K_7, pygame.K_KP7):
                    spot = FAST_TRAVEL_SPOTS[7]
                    self.cam_x, self.cam_y, self.zoom = spot["x"], spot["y"], spot["zoom"]
                elif e.key == pygame.K_u and self.selected:
                    self.sim.upgrade(self.selected)
                elif e.key == pygame.K_m and self.selected and self.selected.get("k") == "miner":
                    self.sim.auto_relocate(self.selected)
                elif e.key == pygame.K_b:
                    self.tool = "miner_u17"

    def render_map(self):
        self.screen.fill(C_WATER_DEEP)
        # Rozsah viditelných dlaždic na obrazovce
        w_left, w_top = self.screen_to_world(0, 40)
        w_right, w_bottom = self.screen_to_world(self.width - 290, self.height - 60)

        # Adaptivní krok vykreslování podle přiblížení
        step = max(1, int(1.0 / (self.zoom / 8.0)))
        size = max(2, int(self.zoom * step))

        for wy in range(w_top - 2, w_bottom + 4, step):
            for wx in range(w_left - 2, w_right + 4, step):
                t = self.sim._world.terrain(wx, wy)
                ore = self.sim._world.ore(wx, wy)
                sx, sy = self.world_to_screen(wx, wy)

                color = (
                    C_WATER if t == T_WATER
                    else C_SAND if t == T_SAND
                    else C_ROCK if t == T_ROCK
                    else C_DRY if t == T_DRY
                    else C_GRASS
                )

                if ore in ORE_COLORS:
                    color = ORE_COLORS[ore]

                pygame.draw.rect(self.screen, color, (sx, sy, size, size))

        # 2. Vykreslení ložisek a jejich štítků
        for dep in self.sim._world.real_deposits:
            dx, dy = dep.get("x", 0), dep.get("y", 0)
            sx, sy = self.world_to_screen(dx, dy)
            # Pokud je ložisko na obrazovce
            if -80 <= sx <= self.width - 200 and -40 <= sy <= self.height - 30:
                rad_px = max(6, int(dep.get("radius", 8) * self.zoom))
                oi = dep.get("ore_index", 1)
                col = ORE_COLORS.get(oi, C_AMBER)
                # Kruh ložiska
                pygame.draw.circle(self.screen, col, (sx, sy), rad_px, 2)

                # Štítek se jménem (jen když není extrémně oddáleno)
                if self.zoom >= 2.0:
                    badge_txt = f"{dep['name'].split('(')[0].strip()}"
                    t_surf = self.font_sm.render(badge_txt, True, C_TEXT)
                    b_rect = t_surf.get_rect(center=(sx, sy - rad_px - 8))
                    pygame.draw.rect(self.screen, (10, 15, 24), (b_rect.x - 4, b_rect.y - 2, b_rect.w + 8, b_rect.h + 4))
                    pygame.draw.rect(self.screen, col, (b_rect.x - 4, b_rect.y - 2, b_rect.w + 8, b_rect.h + 4), 1)
                    self.screen.blit(t_surf, b_rect)

        # 3. Kreslení budov
        for b in self.sim.list:
            bx, by = b["x"], b["y"]
            bw, bh = b.get("w", 1), b.get("h", 1)
            sx, sy = self.world_to_screen(bx, by)
            sw, sh = max(4, int(bw * self.zoom)), max(4, int(bh * self.zoom))

            if b.get("relocating"):
                # Přejíždějící bagr (žlutý pulzující obdélník)
                pygame.draw.rect(self.screen, C_MOVING_MINER, (sx, sy, sw, sh))
                pygame.draw.circle(self.screen, C_AMBER, (sx + sw // 2, sy + sh // 2), max(4, int(sw * 0.9)), 2)
            elif b.get("hq"):
                pygame.draw.rect(self.screen, C_HQ, (sx, sy, sw, sh))
                if self.zoom >= 4.0:
                    t_hq = self.font_bold.render("HQ SKLAD", True, (255, 255, 255))
                    self.screen.blit(t_hq, (sx, sy - 18))
            elif b.get("k") == "miner":
                pygame.draw.rect(self.screen, C_MINER, (sx, sy, sw, sh))
                if b == self.selected:
                    cx, cy = self.world_to_screen(bx + bw / 2, by + bh / 2)
                    r_px = int(reach_of(b) * self.zoom)
                    pygame.draw.circle(self.screen, C_AMBER, (cx, cy), r_px, 1)
            elif b.get("k") == "npc":
                pygame.draw.rect(self.screen, (170, 65, 75), (sx, sy, sw, sh))

            if b == self.selected:
                pygame.draw.rect(self.screen, C_GREEN, (sx - 2, sy - 2, sw + 4, sh + 4), 2)

    def render_ui(self):
        # 1. Horní informační lišta
        pygame.draw.rect(self.screen, C_PANEL, (0, 0, self.width, 38))
        pygame.draw.line(self.screen, C_PANEL_BORDER, (0, 38), (self.width, 38), 1)

        t_money = self.font_bold.render(f"Peníze: ${self.sim.money:,.0f}", True, C_GREEN)
        self.screen.blit(t_money, (15, 9))

        # GPS kurzoru
        mx, my = pygame.mouse.get_pos()
        wx, wy = self.screen_to_world(mx, my)
        lat, lon = self.sim._world.grid_to_geo(wx, wy)
        lat_s = f"{abs(lat):.1f}° {'N' if lat >= 0 else 'S'}"
        lon_s = f"{abs(lon):.1f}° {'E' if lon >= 0 else 'W'}"
        t_gps = self.font.render(f"📍 GPS: {lat_s}, {lon_s} (Měřítko 1 km/px, zoom: {self.zoom:.1f}x)", True, C_AMBER)
        self.screen.blit(t_gps, (220, 9))

        t_fps = self.font.render(f"FPS: {int(self.clock.get_fps())}", True, C_DIM)
        self.screen.blit(t_fps, (self.width - 360, 9))

        # 2. Levý navigační panel (Rychlé skoky po světě)
        nav_h = 36 + len(FAST_TRAVEL_SPOTS) * 26
        pygame.draw.rect(self.screen, (14, 20, 30), (8, 46, 215, nav_h), border_radius=6)
        pygame.draw.rect(self.screen, C_PANEL_BORDER, (8, 46, 215, nav_h), 1, border_radius=6)
        t_nav_h = self.font_bold.render("🌍 Rychlé skoky světa", True, C_AMBER)
        self.screen.blit(t_nav_h, (16, 52))

        for i, spot in enumerate(FAST_TRAVEL_SPOTS):
            btn_y = 76 + i * 26
            is_hover = (12 <= mx <= 215 and btn_y <= my <= btn_y + 22)
            if is_hover:
                pygame.draw.rect(self.screen, (30, 45, 65), (12, btn_y, 207, 22), border_radius=4)
            lbl = f"[{spot['key']}] {spot['label']}"
            self.screen.blit(self.font_sm.render(lbl, True, C_TEXT if not is_hover else C_AMBER), (16, btn_y + 3))

        # 3. Pravý panel s detailem budovy / výběru
        px = self.width - 290
        pygame.draw.rect(self.screen, C_PANEL, (px, 38, 290, self.height - 38))
        pygame.draw.line(self.screen, C_PANEL_BORDER, (px, 38), (px, self.height), 1)

        if self.selected:
            b = self.selected
            title = b.get("name") or (MODELS.get(b.get("model", ""), {}).get("name") if b.get("model") else ("Centrální Sklad" if b.get("hq") else b.get("k")))
            t_name = self.font_title.render(str(title)[:26], True, C_AMBER)
            self.screen.blit(t_name, (px + 14, 52))

            lv_str = f"Úroveň: {'★' * (b.get('lv', 0) + 1)} ({b.get('lv', 0) + 1}/5)"
            self.screen.blit(self.font.render(lv_str, True, C_TEXT), (px + 14, 84))

            if b.get("k") == "miner":
                st_cz = "Těží nerost" if b.get("st") == "run" else ("Přejíždí na ložisko" if b.get("st") == "moving" else "Vytěženo / hledá")
                self.screen.blit(self.font.render(f"Stav: {st_cz}", True, C_GREEN if b.get("st") == "run" else C_AMBER), (px + 14, 110))
                self.screen.blit(self.font.render(f"Dosah těžby: {reach_of(b)} km", True, C_TEXT), (px + 14, 136))
                self.screen.blit(self.font.render(f"Hromada: {len(b.get('out', []))} / {pile_of(b)} t", True, C_TEXT), (px + 14, 162))

                up_c = upgrade_cost(b)
                up_txt = f"[U] Vylepšit na ★{b.get('lv', 0) + 2} (${up_c:,})" if up_c else "Nejvyšší úroveň ★5"
                self.screen.blit(self.font_bold.render(up_txt, True, C_GREEN if up_c else C_DIM), (px + 14, 205))

                reloc_txt = "[M] Přejet na nejbližší ložisko"
                self.screen.blit(self.font_bold.render(reloc_txt, True, C_AMBER), (px + 14, 238))
        else:
            self.screen.blit(self.font_title.render("Výběr budovy", True, C_AMBER), (px + 14, 52))
            self.screen.blit(self.font.render("Klikni na budovu pro podrobnosti", True, C_DIM), (px + 14, 82))
            self.screen.blit(self.font.render("Základna stojí v České republice.", True, C_TEXT), (px + 14, 112))
            self.screen.blit(self.font.render("Kolem jsou ložiska Most, Cínovec a Střeleč.", True, C_TEXT), (px + 14, 134))
            self.screen.blit(self.font.render("Klávesy [1-7, W]: skok po světě", True, C_AMBER), (px + 14, 166))
            self.screen.blit(self.font.render("[B] Postavit bagr na ložisko", True, C_GREEN), (px + 14, 192))
            self.screen.blit(self.font.render("Kolečko myši: plynulý zoom", True, C_TEXT), (px + 14, 218))

        # 4. Spodní lišta nástrojů
        by = self.height - 48
        pygame.draw.rect(self.screen, C_PANEL, (0, by, px, 48))
        pygame.draw.line(self.screen, C_PANEL_BORDER, (0, by), (px, by), 1)

        t_tools = self.font.render("Ovládání: [B] Stavět bagr  |  [U] Vylepšit  |  [M] Přesunout bagr na jiné ložisko  |  [H / 1-7 / W] Rychlé skoky po Zemi", True, C_TEXT)
        self.screen.blit(t_tools, (15, by + 15))

    def run(self):
        while self.running:
            dt = self.clock.tick(60) / 1000.0
            self.handle_events()
            self.sim.tick(dt)
            self.render_map()
            self.render_ui()
            pygame.display.flip()

        pygame.quit()
