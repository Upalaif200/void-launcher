package io.voidlauncher.mod.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;

public class KeystrokesModule extends HudModule {
    private static final int KW = 22, KH = 22, GAP = 2, PAD = 4;
    private static final int SMALL = 16;

    public KeystrokesModule() {
        super(PAD, 0);
    }

    @Override
    public void render(GuiGraphics gg) {
        var opts = Minecraft.getInstance().options;
        float s = getRenderScale();
        int gh = Minecraft.getInstance().getWindow().getGuiScaledHeight();
        switch (form) {
            case 0 -> renderDefault(gg, opts, s, gh);
            case 1 -> renderHorizontal(gg, opts, s, gh);
            case 2 -> renderCompact(gg, opts, s, gh);
            case 3 -> renderMinimal(gg, opts, s, gh);
        }
    }

    private void renderDefault(GuiGraphics gg, net.minecraft.client.Options opts, float s, int gh) {
        int baseY = gh - getHeight() - PAD;
        int kw = Math.round(KW * s), kh = Math.round(KH * s), gap = Math.max(1, Math.round(GAP * s));
        renderBoxes(gg, x, baseY, kw, kh, gap, s);
    }

    private void renderHorizontal(GuiGraphics gg, net.minecraft.client.Options opts, float s, int gh) {
        int baseY = gh - getHeight() - PAD;
        int kw = Math.round(KW * s), kh = Math.round(KH * s), gap = Math.max(1, Math.round(GAP * s));
        renderBoxesRow(gg, x, baseY, kw, kh, gap, s);
    }

    private void renderCompact(GuiGraphics gg, net.minecraft.client.Options opts, float s, int gh) {
        int baseY = gh - getHeight() - PAD;
        int kw = Math.round(SMALL * s), kh = Math.round(SMALL * s), gap = 1;
        renderBoxesMini(gg, x, baseY, kw, kh, gap, s);
    }

    private void renderMinimal(GuiGraphics gg, net.minecraft.client.Options opts, float s, int gh) {
        int baseY = gh - getHeight() - PAD;
        int kw = Math.round(KW * s), kh = Math.round(KH * s), gap = Math.round(GAP * s);
        renderBoxesMini(gg, x, baseY, kw, kh, gap, s);
    }

    private void renderBox(GuiGraphics gg, int bx, int by, int bw, int bh, String label, boolean pressed, float s) {
        int bg = pressed ? applyAlpha(0xAAFFFFFF) : applyAlpha(0x88000000);
        int fg = pressed ? 0xFF000000 : 0xFFFFFFFF;
        gg.fill(bx, by, bx + bw, by + bh, bg);
        var font = Minecraft.getInstance().font;
        int tx = bx + (bw - font.width(label)) / 2;
        int ty = by + (bh - font.lineHeight) / 2 + 1;
        gg.drawString(font, label, tx, ty, fg);
    }

    private void renderBoxes(GuiGraphics gg, int bx, int by, int kw, int kh, int gap, float s) {
        var opts = Minecraft.getInstance().options;
        boolean w = opts.keyUp.isDown(), a = opts.keyLeft.isDown(), d = opts.keyRight.isDown();
        boolean s_ = opts.keyDown.isDown(), sp = opts.keyJump.isDown(), sh = opts.keyShift.isDown(), ct = opts.keySprint.isDown();

        renderBox(gg, bx, by, kw, kh, "W", w, s);
        renderBox(gg, bx + kw + gap, by, kw, kh, "D", d, s);
        renderBox(gg, bx, by + kh + gap, kw, kh, "A", a, s);
        renderBox(gg, bx + kw + gap, by + kh + gap, kw, kh, "S", s_, s);

        int sy = by + 2 * (kh + gap);
        renderBox(gg, bx, sy, 2 * kw + gap, kh, "Space", sp, s);
        int my = sy + kh + gap;
        renderBox(gg, bx, my, kw, kh, "Shift", sh, s);
        renderBox(gg, bx + kw + gap, my, kw, kh, "Ctrl", ct, s);
    }

    private void renderBoxesRow(GuiGraphics gg, int bx, int by, int kw, int kh, int gap, float s) {
        var opts = Minecraft.getInstance().options;
        boolean w = opts.keyUp.isDown(), a = opts.keyLeft.isDown(), d = opts.keyRight.isDown();
        boolean s_ = opts.keyDown.isDown(), sp = opts.keyJump.isDown(), sh = opts.keyShift.isDown(), ct = opts.keySprint.isDown();

        int cx = bx;
        renderBox(gg, cx, by, kw, kh, "W", w, s); cx += kw + gap;
        renderBox(gg, cx, by, kw, kh, "A", a, s); cx += kw + gap;
        renderBox(gg, cx, by, kw, kh, "S", s_, s); cx += kw + gap;
        renderBox(gg, cx, by, kw, kh, "D", d, s); cx += kw + gap;
        renderBox(gg, cx, by, kw, kh, "Space", sp, s); cx += kw + gap;
        renderBox(gg, cx, by, kw, kh, "Shift", sh, s); cx += kw + gap;
        renderBox(gg, cx, by, kw, kh, "Ctrl", ct, s);
    }

    private void renderBoxesMini(GuiGraphics gg, int bx, int by, int kw, int kh, int gap, float s) {
        var opts = Minecraft.getInstance().options;
        boolean w = opts.keyUp.isDown(), a = opts.keyLeft.isDown(), d = opts.keyRight.isDown(), s_ = opts.keyDown.isDown();

        renderBox(gg, bx, by, kw, kh, "W", w, s);
        renderBox(gg, bx + kw + gap, by, kw, kh, "D", d, s);
        renderBox(gg, bx, by + kh + gap, kw, kh, "A", a, s);
        renderBox(gg, bx + kw + gap, by + kh + gap, kw, kh, "S", s_, s);
    }

    @Override
    public int getWidth() {
        float s = getRenderScale();
        return switch (form) {
            case 1 -> Math.round((7 * KW + 6 * GAP) * s);
            case 2 -> Math.round((2 * SMALL + 1) * s);
            default -> Math.round((2 * KW + GAP) * s);
        };
    }

    @Override
    public int getHeight() {
        float s = getRenderScale();
        return switch (form) {
            case 1 -> Math.round(KH * s);
            case 2 -> Math.round((2 * SMALL + 1) * s);
            case 3 -> Math.round((2 * KH + GAP) * s);
            default -> Math.round((3 * KH + 2 * GAP + KH) * s);
        };
    }
}
