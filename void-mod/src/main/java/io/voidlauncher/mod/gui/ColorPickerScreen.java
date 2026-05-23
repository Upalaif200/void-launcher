package io.voidlauncher.mod.gui;

import io.voidlauncher.mod.hud.HudManager;
import io.voidlauncher.mod.hud.HudModule;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.CommonComponents;
import net.minecraft.network.chat.Component;

public class ColorPickerScreen extends Screen {
    private static final int[] COLORS = {
        0xFFFFFFFF, 0xFFFF0000, 0xFF00FF00, 0xFF0000FF,
        0xFFFFFF00, 0xFFFF00FF, 0xFF00FFFF, 0xFF808080,
        0xFFFF8000, 0xFF80FF00
    };
    private static final int COLS = 5, BW = 30, BH = 20, GAP = 4;

    private final HudModule module;
    private final Screen parent;

    public ColorPickerScreen(HudModule module, Screen parent) {
        super(Component.literal("Pick a Color"));
        this.module = module;
        this.parent = parent;
    }

    @Override
    protected void init() {
        super.init();
        int totalW = COLS * BW + (COLS - 1) * GAP;
        int sx = (width - totalW) / 2;
        int sy = height / 2 - 30;

        for (int i = 0; i < COLORS.length; i++) {
            int row = i / COLS, col = i % COLS;
            int c = COLORS[i];
            int bx = sx + col * (BW + GAP);
            int by = sy + row * (BH + GAP);
            addRenderableWidget(Button.builder(
                Component.literal(""),
                btn -> {
                    module.setColor(c);
                    HudManager.getInstance().saveConfig();
                    minecraft.setScreen(parent);
                })
                .bounds(bx, by, BW, BH)
                .build());
        }

        int rows = (COLORS.length + COLS - 1) / COLS;
        addRenderableWidget(Button.builder(
            CommonComponents.GUI_BACK,
            btn -> minecraft.setScreen(parent))
            .bounds(width / 2 - 30, sy + rows * (BH + GAP) + 8, 60, 20)
            .build());
    }

    @Override
    public void render(GuiGraphics gg, int mx, int my, float delta) {
        renderBackground(gg, mx, my, delta);
        super.render(gg, mx, my, delta);
        gg.drawString(font, "Current: 0x" + Integer.toHexString(module.getColor()), width / 2 - 50, height / 2 - 60, 0xFFFFFF);
    }
}