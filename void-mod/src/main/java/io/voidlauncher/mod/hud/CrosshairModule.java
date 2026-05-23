package io.voidlauncher.mod.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;

public class CrosshairModule extends HudModule {
    private static final int SIZE = 6, GAP = 3, THICK = 1;
    private int style; // 0-3 persisted via config

    public CrosshairModule() {
        super(0, 0);
        this.style = 0;
    }

    public int getStyle() { return style; }
    public void setStyle(int s) { this.style = s; }

    @Override
    public void render(GuiGraphics gg) {
        var mc = Minecraft.getInstance();
        if (mc.player == null) return;
        int cx = mc.getWindow().getGuiScaledWidth() / 2;
        int cy = mc.getWindow().getGuiScaledHeight() / 2;
        int c = color;

        switch (style) {
            case 0 -> renderDefault(gg, cx, cy, c);
            case 1 -> renderClassicPlus(gg, cx, cy, c);
            case 2 -> renderDot(gg, cx, cy, c);
            case 3 -> renderCircle(gg, cx, cy, c);
        }
    }

    private void renderDefault(GuiGraphics gg, int cx, int cy, int c) {
        gg.fill(cx - GAP - SIZE, cy - THICK, cx - GAP, cy + THICK, c);
        gg.fill(cx + GAP, cy - THICK, cx + GAP + SIZE, cy + THICK, c);
        gg.fill(cx - THICK, cy - GAP - SIZE, cx + THICK, cy - GAP, c);
        gg.fill(cx - THICK, cy + GAP, cx + THICK, cy + GAP + SIZE, c);
    }

    private void renderClassicPlus(GuiGraphics gg, int cx, int cy, int c) {
        int len = SIZE + GAP;
        gg.fill(cx - len, cy - THICK, cx + len, cy + THICK, c);
        gg.fill(cx - THICK, cy - len, cx + THICK, cy + len, c);
    }

    private void renderDot(GuiGraphics gg, int cx, int cy, int c) {
        gg.fill(cx - 1, cy - 1, cx + 2, cy + 2, c);
    }

    private void renderCircle(GuiGraphics gg, int cx, int cy, int c) {
        int r = 5;
        gg.fill(cx - r, cy, cx + r, cy + 1, c);
        gg.fill(cx, cy - r, cx + 1, cy + r, c);
        // Approximate circle with fills at radius intervals
        for (int i = -r; i <= r; i++) {
            int dx = (int) Math.round(Math.sqrt(r * r - i * i));
            gg.fill(cx - dx, cy + i, cx - dx + 1, cy + i + 1, c);
            gg.fill(cx + dx, cy + i, cx + dx + 1, cy + i + 1, c);
        }
    }

    @Override public int getWidth() { return 2 * (GAP + SIZE); }
    @Override public int getHeight() { return 2 * (GAP + SIZE); }
}
