package io.voidlauncher.mod.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;

public class CrosshairModule extends HudModule {
    private static final int SIZE = 6, GAP = 3, THICK = 1;
    private int style;

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
        int c = applyAlpha(color);
        float s = getRenderScale();

        switch (style) {
            case 0 -> renderDefault(gg, cx, cy, c, s);
            case 1 -> renderClassicPlus(gg, cx, cy, c, s);
            case 2 -> renderDot(gg, cx, cy, c, s);
            case 3 -> renderCircle(gg, cx, cy, c, s);
            default -> renderDefault(gg, cx, cy, c, s);
        }
    }

    private void renderDefault(GuiGraphics gg, int cx, int cy, int c, float s) {
        int size = Math.round(SIZE * s), gap = Math.round(GAP * s);
        gg.fill(cx - gap - size, cy - 1, cx - gap, cy + 1, c);
        gg.fill(cx + gap, cy - 1, cx + gap + size, cy + 1, c);
        gg.fill(cx - 1, cy - gap - size, cx + 1, cy - gap, c);
        gg.fill(cx - 1, cy + gap, cx + 1, cy + gap + size, c);
    }

    private void renderClassicPlus(GuiGraphics gg, int cx, int cy, int c, float s) {
        int len = Math.round((SIZE + GAP) * s);
        gg.fill(cx - len, cy - 1, cx + len, cy + 1, c);
        gg.fill(cx - 1, cy - len, cx + 1, cy + len, c);
    }

    private void renderDot(GuiGraphics gg, int cx, int cy, int c, float s) {
        int r = Math.max(1, Math.round(s));
        gg.fill(cx - r, cy - r, cx + r + 1, cy + r + 1, c);
    }

    private static int cachedCircleR = -1;
    private static int[] cachedCircleDx;

    private void renderCircle(GuiGraphics gg, int cx, int cy, int c, float s) {
        int r = Math.round(5 * s);
        if (r != cachedCircleR) {
            cachedCircleR = r;
            cachedCircleDx = new int[r * 2 + 1];
            for (int i = -r; i <= r; i++)
                cachedCircleDx[i + r] = (int) Math.round(Math.sqrt(r * r - i * i));
        }
        for (int i = -r; i <= r; i++) {
            int dx = cachedCircleDx[i + r];
            gg.fill(cx - dx, cy + i, cx - dx + 1, cy + i + 1, c);
            gg.fill(cx + dx, cy + i, cx + dx + 1, cy + i + 1, c);
        }
    }

    @Override
    public int getWidth() {
        float s = getRenderScale();
        return Math.round(2 * (GAP + SIZE) * s);
    }

    @Override
    public int getHeight() {
        float s = getRenderScale();
        return Math.round(2 * (GAP + SIZE) * s);
    }
}
