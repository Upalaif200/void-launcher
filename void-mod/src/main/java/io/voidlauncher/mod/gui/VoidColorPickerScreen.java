package io.voidlauncher.mod.gui;

import io.voidlauncher.mod.hud.HudManager;
import io.voidlauncher.mod.hud.HudModule;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

import java.awt.Color;

public class VoidColorPickerScreen extends Screen {
    private static final int COLS = 8, BW = 20, BH = 18, GAP = 2;

    private static final int[] COLORS = {
        0xFFFFFFFF, 0xFFFF0000, 0xFFFF8000, 0xFFFFFF00, 0xFF00FF00, 0xFF00FFFF, 0xFF0000FF, 0xFFFF00FF,
        0xFFC0C0C0, 0xFF800000, 0xFF804000, 0xFF808000, 0xFF008000, 0xFF008080, 0xFF000080, 0xFF800080,
        0xFF808080, 0xFF400000, 0xFF402000, 0xFF404000, 0xFF004000, 0xFF004040, 0xFF000040, 0xFF400040,
        0xFF000000, 0xFF200000, 0xFF201000, 0xFF202000, 0xFF002000, 0xFF002020, 0xFF000020, 0xFF200020
    };

    private final HudModule module;
    private final Screen parent;
    private EditBox hexBox;
    private int currentColor;

    public VoidColorPickerScreen(HudModule module, Screen parent) {
        super(Component.literal("Selector de Color"));
        this.module = module;
        this.parent = parent;
        this.currentColor = module.getColor() | 0xFF000000;
    }

    @Override
    protected void init() {
        super.init();

        int totalW = COLS * BW + (COLS - 1) * GAP;
        int sx = (width - totalW) / 2;
        int sy = height / 2 - 40;

        for (int i = 0; i < COLORS.length; i++) {
            int row = i / COLS, col = i % COLS;
            int c = COLORS[i];
            int finalI = i;
            addRenderableWidget(Button.builder(Component.literal(""),
                btn -> { currentColor = COLORS[finalI]; updateHex(); })
                .bounds(sx + col * (BW + GAP), sy + row * (BH + GAP), BW, BH).build());
        }

        int rows = (COLORS.length + COLS - 1) / COLS;
        int panelY = sy + rows * (BH + GAP) + 10;

        hexBox = new EditBox(font, sx, panelY, 80, 16, Component.literal("Hex"));
        hexBox.setMaxLength(7);
        hexBox.setValue(String.format("#%06X", currentColor & 0xFFFFFF));
        hexBox.setFilter(s -> s.matches("#?[0-9a-fA-F]{0,6}"));
        addRenderableWidget(hexBox);

        addRenderableWidget(Button.builder(Component.literal("Aplicar"),
            btn -> {
                String hex = hexBox.getValue().replace("#", "");
                if (hex.length() == 6) {
                    module.setColor(0xFF000000 | Integer.parseInt(hex, 16));
                } else {
                    module.setColor(0xFF000000 | (currentColor & 0xFFFFFF));
                }
                HudManager.getInstance().saveConfig();
                minecraft.setScreen(parent);
            })
            .bounds(sx + 84, panelY - 1, 60, 18).build());

        addRenderableWidget(Button.builder(Component.literal("Cancelar"),
            btn -> minecraft.setScreen(parent))
            .bounds(sx + 148, panelY - 1, 60, 18).build());
    }

    private void updateHex() {
        hexBox.setValue(String.format("#%06X", currentColor & 0xFFFFFF));
    }

    @Override
    public void render(GuiGraphics gg, int mx, int my, float delta) {
        renderBackground(gg, mx, my, delta);

        int totalW = COLS * BW + (COLS - 1) * GAP;
        int sx = (width - totalW) / 2;
        int sy = height / 2 - 40;

        // Draw color swatches behind buttons
        for (int i = 0; i < COLORS.length; i++) {
            int row = i / COLS, col = i % COLS;
            int x = sx + col * (BW + GAP);
            int y = sy + row * (BH + GAP);
            gg.fill(x + 1, y + 1, x + BW - 1, y + BH - 1, COLORS[i]);
            if (COLORS[i] == currentColor) {
                gg.fill(x, y, x + BW, y + 1, 0xFFFFFFFF);
                gg.fill(x, y + BH - 1, x + BW, y + BH, 0xFFFFFFFF);
                gg.fill(x, y, x + 1, y + BH, 0xFFFFFFFF);
                gg.fill(x + BW - 1, y, x + BW, y + BH, 0xFFFFFFFF);
            }
        }

        int rows = (COLORS.length + COLS - 1) / COLS;
        int py = sy + rows * (BH + GAP) + 10;

        // Preview
        gg.drawString(font, "Vista previa:", sx, py + 22, 0x808080);
        gg.fill(sx, py + 32, sx + 40, py + 52, 0xFF000000);
        gg.fill(sx + 1, py + 33, sx + 39, py + 51, currentColor);
        gg.drawString(font, String.format("#%06X", currentColor & 0xFFFFFF), sx + 46, py + 38, 0xFFFFFF);

        super.render(gg, mx, my, delta);
    }
}
