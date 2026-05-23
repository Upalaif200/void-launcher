package io.voidlauncher.mod.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;

public class CrosshairModule extends HudModule {
    private static final int SIZE = 6, GAP = 3, THICK = 1;

    public CrosshairModule() {
        super(0, 0);
    }

    @Override
    public void render(GuiGraphics gg) {
        var mc = Minecraft.getInstance();
        if (mc.player == null) return;
        int cx = mc.getWindow().getGuiScaledWidth() / 2;
        int cy = mc.getWindow().getGuiScaledHeight() / 2;

        int c = color;
        gg.fill(cx - GAP - SIZE, cy - THICK, cx - GAP, cy + THICK, c);
        gg.fill(cx + GAP, cy - THICK, cx + GAP + SIZE, cy + THICK, c);
        gg.fill(cx - THICK, cy - GAP - SIZE, cx + THICK, cy - GAP, c);
        gg.fill(cx - THICK, cy + GAP, cx + THICK, cy + GAP + SIZE, c);
    }

    @Override public int getWidth() { return 2 * (GAP + SIZE); }
    @Override public int getHeight() { return 2 * (GAP + SIZE); }
}