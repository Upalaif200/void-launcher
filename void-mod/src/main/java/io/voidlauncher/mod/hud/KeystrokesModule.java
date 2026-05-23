package io.voidlauncher.mod.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;

public class KeystrokesModule extends HudModule {
    private static final int KW = 22, KH = 22, GAP = 2, PAD = 4;

    public KeystrokesModule() {
        super(PAD, 0);
    }

    @Override
    public void render(GuiGraphics gg) {
        var opts = Minecraft.getInstance().options;
        y = Minecraft.getInstance().getWindow().getGuiScaledHeight() - getHeight() - PAD;

        renderBox(gg, x, y, KW, KH, "W", opts.keyUp.isDown());
        renderBox(gg, x, y + KH + GAP, KW, KH, "A", opts.keyLeft.isDown());
        renderBox(gg, x + KW + GAP, y, KW, KH, "D", opts.keyRight.isDown());
        renderBox(gg, x + KW + GAP, y + KH + GAP, KW, KH, "S", opts.keyDown.isDown());

        int sy = y + 2 * (KH + GAP);
        renderBox(gg, x, sy, 2 * KW + GAP, KH, "Space", opts.keyJump.isDown());

        int my = sy + KH + GAP;
        renderBox(gg, x, my, KW, KH, "Shift", opts.keyShift.isDown());
        renderBox(gg, x + KW + GAP, my, KW, KH, "Ctrl", opts.keySprint.isDown());
    }

    private void renderBox(GuiGraphics gg, int bx, int by, int bw, int bh, String label, boolean pressed) {
        int bg = pressed ? 0xAAFFFFFF : 0x88000000;
        int fg = pressed ? 0xFF000000 : 0xFFFFFFFF;
        gg.fill(bx, by, bx + bw, by + bh, bg);
        var font = Minecraft.getInstance().font;
        int tx = bx + (bw - font.width(label)) / 2;
        int ty = by + (bh - font.lineHeight) / 2 + 1;
        gg.drawString(font, label, tx, ty, fg);
    }

    @Override public int getWidth() { return 2 * KW + GAP; }
    @Override public int getHeight() { return 3 * KH + 2 * GAP + KH; }
}