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
        var mc = Minecraft.getInstance();
        float s = getRenderScale();

        switch (form) {
            case 0 -> renderDefault(gg, opts, s);
            case 1 -> renderHorizontal(gg, opts, s);
            case 2 -> renderCompact(gg, opts, s);
            case 3 -> renderMinimal(gg, opts, s);
        }
    }

    private void renderDefault(GuiGraphics gg, net.minecraft.client.Options opts, float s) {
        y = Minecraft.getInstance().getWindow().getGuiScaledHeight() - getHeight() - PAD;
        int kw = Math.round(KW * s), kh = Math.round(KH * s), gap = Math.max(1, Math.round(GAP * s));

        renderBox(gg, x, y, kw, kh, "W", opts.keyUp.isDown(), s);
        renderBox(gg, x + kw + gap, y, kw, kh, "D", opts.keyRight.isDown(), s);
        renderBox(gg, x, y + kh + gap, kw, kh, "A", opts.keyLeft.isDown(), s);
        renderBox(gg, x + kw + gap, y + kh + gap, kw, kh, "S", opts.keyDown.isDown(), s);

        int sy = y + 2 * (kh + gap);
        renderBox(gg, x, sy, 2 * kw + gap, kh, "Space", opts.keyJump.isDown(), s);

        int my = sy + kh + gap;
        renderBox(gg, x, my, kw, kh, "Shift", opts.keyShift.isDown(), s);
        renderBox(gg, x + kw + gap, my, kw, kh, "Ctrl", opts.keySprint.isDown(), s);
    }

    private void renderHorizontal(GuiGraphics gg, net.minecraft.client.Options opts, float s) {
        y = Minecraft.getInstance().getWindow().getGuiScaledHeight() - getHeight() - PAD;
        int kw = Math.round(KW * s), kh = Math.round(KH * s), gap = Math.max(1, Math.round(GAP * s));

        int cx = x;
        renderBox(gg, cx, y, kw, kh, "W", opts.keyUp.isDown(), s); cx += kw + gap;
        renderBox(gg, cx, y, kw, kh, "A", opts.keyLeft.isDown(), s); cx += kw + gap;
        renderBox(gg, cx, y, kw, kh, "S", opts.keyDown.isDown(), s); cx += kw + gap;
        renderBox(gg, cx, y, kw, kh, "D", opts.keyRight.isDown(), s); cx += kw + gap;
        renderBox(gg, cx, y, kw, kh, "Space", opts.keyJump.isDown(), s); cx += kw + gap;
        renderBox(gg, cx, y, kw, kh, "Shift", opts.keyShift.isDown(), s); cx += kw + gap;
        renderBox(gg, cx, y, kw, kh, "Ctrl", opts.keySprint.isDown(), s);
    }

    private void renderCompact(GuiGraphics gg, net.minecraft.client.Options opts, float s) {
        y = Minecraft.getInstance().getWindow().getGuiScaledHeight() - getHeight() - PAD;
        int kw = Math.round(SMALL * s), kh = Math.round(SMALL * s), gap = 1;

        renderBox(gg, x, y, kw, kh, "W", opts.keyUp.isDown(), s);
        renderBox(gg, x + kw + gap, y, kw, kh, "D", opts.keyRight.isDown(), s);
        renderBox(gg, x, y + kh + gap, kw, kh, "A", opts.keyLeft.isDown(), s);
        renderBox(gg, x + kw + gap, y + kh + gap, kw, kh, "S", opts.keyDown.isDown(), s);
    }

    private void renderMinimal(GuiGraphics gg, net.minecraft.client.Options opts, float s) {
        y = Minecraft.getInstance().getWindow().getGuiScaledHeight() - getHeight() - PAD;
        int kw = Math.round(KW * s), kh = Math.round(KH * s), gap = Math.round(GAP * s);

        renderBox(gg, x, y, kw, kh, "W", opts.keyUp.isDown(), s);
        renderBox(gg, x + kw + gap, y, kw, kh, "D", opts.keyRight.isDown(), s);
        renderBox(gg, x, y + kh + gap, kw, kh, "A", opts.keyLeft.isDown(), s);
        renderBox(gg, x + kw + gap, y + kh + gap, kw, kh, "S", opts.keyDown.isDown(), s);
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

    @Override
    public int getWidth() {
        float s = getRenderScale();
        return switch (form) {
            case 1 -> Math.round((7 * KW + 6 * GAP) * s);
            case 2 -> Math.round((2 * SMALL + 1) * s);
            case 3 -> Math.round((2 * KW + GAP) * s);
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
