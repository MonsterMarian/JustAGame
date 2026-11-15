"""Grafická desktopová hra v pygame-ce s plynulým pohledem na svět,
interaktivním ovládáním, minimapou a vizualizací přejíždějících bagrů.
"""
import sys
import math
from typing import Optional, Tuple
from pathlib import Path
import pygame

from .sim import Sim, upgrade_cost, mod_cost, MODS, ORES, reach_of, pile_of
from .world import T_WATER, T_SAND, T_GRASS, T_DRY, T_ROCK
from .catalog import MODELS, ITEMS

# Paleta barev
C_BG = (10, 14, 20)
C_GRID = (25, 32, 42)
C_WATER = (35, 75, 130)
C_SAND = (195, 175, 120)
C_GRASS = (45, 95, 45)
C_DRY = (90, 110, 60)
C_ROCK = (85, 90, 100)
C_HQ = (50, 130, 200)
C_MINER = (220, 150, 40)
C_MOVING_MINER = (255, 200, 50)
C_TEXT = (235, 235, 230)
C_AMBER = (255, 170, 50)
C_GREEN = (60, 200, 110)
C_PANEL = (18, 24, 34)
C_PANEL_BORDER = (45, 60, 80)

ORE_COLORS = {
    1: (230, 225, 215),  # quartz
    2: (35, 38, 43),     # coal
    3: (200, 120, 60),   # copper
    4: (180, 85, 60),    # bauxite
    5: (240, 200, 210),  # salt
    6: (155, 110, 215),  # fluorite
    7: (140, 145, 155),  # tin
    8: (240, 190, 65),   # gold
}

class GameApp:
    """Hlavní desktopová aplikace pro MakeYourCPU."""

    def __init__(self, sim: Optional[Sim] = None, width: int = 1200, height: int = 750):
        pygame.init()
        pygame.display.set_caption("MakeYourCPU — Simulátor výroby a těžby (Python Desktop)")
        self.width = width
        self.height = height
        self.screen = pygame.display.set_mode((width, height), pygame.RESIZABLE)
        self.clock = pygame.time.Clock()
        self.font = pygame.font.SysFont("Segoe UI, Arial, sans-serif", 14)
        self.font_bold = pygame.font.SysFont("Segoe UI, Arial, sans-serif", 15, bold=True)
        self.font_title = pygame.font.SysFont("Segoe UI, Arial, sans-serif", 18, bold=True)

        self.sim = sim or Sim(seed=4)
        self.cam_x = 0.0
        self.cam_y = 0.0
        self.zoom = 20.0  # pixelů na dlaždici
        self.dragging = False
        self.drag_start = (0, 0)
        self.selected: Optional[dict] = None
        self.tool: Optional[str] = None
        self.running = True

    def world_to_screen(self, wx: float, wy: float) -> Tuple[int, int]:
        sx = int(self.width / 2 + (wx - self.cam_x) * self.zoom)
        sy = int(self.height / 2 + (wy - self.cam_y) * self.zoom)
        return sx, sy

    def screen_to_world(self, sx: int, sy: int) -> Tuple[int, int]:
        wx = int(math.floor(self.cam_x + (sx - self.width / 2) / self.zoom))
        wy = int(math.floor(self.cam_y + (sy - self.height / 2) / self.zoom))
        return wx, wy

    def handle_events(self):
        for e in pygame.event.get():
            if e.type == pygame.QUIT:
                self.running = False
            elif e.type == pygame.VIDEORESIZE:
                self.width, self.height = e.w, e.h
                self.screen = pygame.display.set_mode((e.w, e.h), pygame.RESIZABLE)
            elif e.type == pygame.MOUSEBUTTONDOWN:
                if e.button == 1:  # Levé tlačítko
                    if e.pos[0] < self.width - 280 and e.pos[1] > 40 and e.pos[1] < self.height - 60:
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
                    self.zoom = min(60.0, self.zoom * 1.15)
                elif e.button == 5:  # Kolečko dolů (zoom out)
                    self.zoom = max(6.0, self.zoom / 1.15)
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
                elif e.key == pygame.K_u:
                    if self.selected:
                        self.sim.upgrade(self.selected)
                elif e.key == pygame.K_m and self.selected and self.selected.get("k") == "miner":
                    self.sim.auto_relocate(self.selected)
                elif e.key == pygame.K_1:
                    self.tool = "miner_u17"
                elif e.key == pygame.K_2:
                    self.tool = "quarry_hand"
                elif e.key == pygame.K_3:
                    self.tool = "miner_cat320"

    def render_map(self):
        self.screen.fill(C_BG)
        # Rozsah viditelných dlaždic
        w_left, w_top = self.screen_to_world(0, 40)
        w_right, w_bottom = self.screen_to_world(self.width - 280, self.height - 60)

        step = max(1, int(1.0 / (self.zoom / 20.0)))
        for wy in range(w_top - 1, w_bottom + 2, step):
            for wx in range(w_left - 1, w_right + 2, step):
                sx, sy = self.world_to_screen(wx, wy)
                size = max(2, int(self.zoom * step))
                t = self.sim._world.terrain(wx, wy)
                ore = self.sim._world.ore(wx, wy)

                color = C_WATER if t == T_WATER else (C_SAND if t == T_SAND else (C_ROCK if t == T_ROCK else (C_DRY if t == T_DRY else C_GRASS)))
                if ore in ORE_COLORS:
                    color = ORE_COLORS[ore]

                pygame.draw.rect(self.screen, color, (sx, sy, size, size))

        # Kreslení budov
        for b in self.sim.list:
            bx, by = b["x"], b["y"]
            bw, bh = b.get("w", 1), b.get("h", 1)
            sx, sy = self.world_to_screen(bx, by)
            sw, sh = int(bw * self.zoom), int(bh * self.zoom)

            if b.get("relocating"):
                # Přejíždějící bagr
                pygame.draw.rect(self.screen, C_MOVING_MINER, (sx, sy, max(4, sw), max(4, sh)))
                pygame.draw.circle(self.screen, C_AMBER, (sx + sw // 2, sy + sh // 2), max(3, int(sw * 0.8)), 2)
            elif b.get("hq"):
                pygame.draw.rect(self.screen, C_HQ, (sx, sy, sw, sh))
            elif b.get("k") == "miner":
                pygame.draw.rect(self.screen, C_MINER, (sx, sy, sw, sh))
                # Indikátor dosahu bagru
                if b == self.selected:
                    cx, cy = self.world_to_screen(bx + bw / 2, by + bh / 2)
                    r_px = int(reach_of(b) * self.zoom)
                    pygame.draw.circle(self.screen, C_AMBER, (cx, cy), r_px, 1)
            elif b.get("k") == "npc":
                pygame.draw.rect(self.screen, (160, 60, 70), (sx, sy, sw, sh))

            # Zvýraznění výběru
            if b == self.selected:
                pygame.draw.rect(self.screen, C_GREEN, (sx - 2, sy - 2, sw + 4, sh + 4), 2)

    def render_ui(self):
        # 1. Horní pruh se stavem
        pygame.draw.rect(self.screen, C_PANEL, (0, 0, self.width, 38))
        pygame.draw.line(self.screen, C_PANEL_BORDER, (0, 38), (self.width, 38), 1)

        t_money = self.font_bold.render(f"Peníze: ${self.sim.money:,.0f}", True, C_GREEN)
        t_time = self.font.render(f"Herní čas: {self.sim.t / 3600.0:.1f} h", True, C_TEXT)
        t_fps = self.font.render(f"FPS: {int(self.clock.get_fps())}", True, (130, 140, 150))
        self.screen.blit(t_money, (15, 9))
        self.screen.blit(t_time, (220, 9))
        self.screen.blit(t_fps, (380, 9))

        # 2. Pravý panel s detailem budovy
        px = self.width - 280
        pygame.draw.rect(self.screen, C_PANEL, (px, 38, 280, self.height - 38))
        pygame.draw.line(self.screen, C_PANEL_BORDER, (px, 38), (px, self.height), 1)

        title = "Žádný výběr"
        if self.selected:
            b = self.selected
            title = b.get("name") or (MODELS.get(b.get("model", ""), {}).get("name") if b.get("model") else ("Centrální Sklad" if b.get("hq") else b.get("k")))
            t_name = self.font_title.render(str(title)[:26], True, C_AMBER)
            self.screen.blit(t_name, (px + 12, 50))

            lv_str = f"Úroveň: {'★' * (b.get('lv', 0) + 1)} ({b.get('lv', 0) + 1}/5)"
            self.screen.blit(self.font.render(lv_str, True, C_TEXT), (px + 12, 80))

            if b.get("k") == "miner":
                st_cz = "Těží" if b.get("st") == "run" else ("Přejíždí na ložisko" if b.get("st") == "moving" else "Vytěženo / čeká")
                self.screen.blit(self.font.render(f"Stav: {st_cz}", True, C_GREEN if b.get("st") == "run" else C_AMBER), (px + 12, 105))
                self.screen.blit(self.font.render(f"Dosah těžby: {reach_of(b)} m", True, C_TEXT), (px + 12, 130))
                self.screen.blit(self.font.render(f"Hromada: {len(b.get('out', []))} / {pile_of(b)} t", True, C_TEXT), (px + 12, 155))

                # Tlačítka pro bagr
                up_c = upgrade_cost(b)
                up_txt = f"[U] Vylepšit na ★{b.get('lv', 0) + 2} (${up_c})" if up_c else "Nejvyšší úroveň ★5"
                self.screen.blit(self.font_bold.render(up_txt, True, C_GREEN if up_c else (120, 120, 120)), (px + 12, 195))

                reloc_txt = "[M] Přejet na jiné ložisko"
                self.screen.blit(self.font_bold.render(reloc_txt, True, C_AMBER), (px + 12, 225))
        else:
            self.screen.blit(self.font.render("Kliknutím vyber budovu", True, (130, 140, 150)), (px + 12, 55))
            self.screen.blit(self.font.render("Klávesy 1, 2, 3: postavit bagr", True, C_TEXT), (px + 12, 85))
            self.screen.blit(self.font.render("Kolečko: přiblížení / oddálení", True, C_TEXT), (px + 12, 110))
            self.screen.blit(self.font.render("Tažení myší: posun po mapě", True, C_TEXT), (px + 12, 135))

        # 3. Spodní lišta nástrojů
        by = self.height - 50
        pygame.draw.rect(self.screen, C_PANEL, (0, by, px, 50))
        pygame.draw.line(self.screen, C_PANEL_BORDER, (0, by), (px, by), 1)

        t_tools = self.font.render("Stavět: [1] Kubota U17  [2] Ruční lom  [3] CAT 320D  |  [Esc] Zrušit  [U] Vylepšit  [M] Přesunout bagr", True, C_TEXT)
        self.screen.blit(t_tools, (15, by + 16))

    def run(self):
        while self.running:
            dt = self.clock.tick(60) / 1000.0
            self.handle_events()
            self.sim.tick(dt)
            self.render_map()
            self.render_ui()
            pygame.display.flip()

        pygame.quit()
