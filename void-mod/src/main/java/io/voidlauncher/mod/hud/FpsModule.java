package io.voidlauncher.mod.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;

public class FpsModule extends HudModule {
    private String cachedText = "FPS: 0";
    private int lastFps = -1;
    private int lastColor;

    public FpsModule() {
        super(2, 2);
    }

    @Override
    public void render(GuiGraphics gg) {
        var mc = Minecraft.getInstance();
        int fps = mc.getFps();
        if (fps != lastFps) {
            lastFps = fps;
            cachedText = "FPS: " + fps;
            lastColor = fps >= 60 ? 0xFF00FF00 : fps >= 30 ? 0xFFFFFF00 : 0xFFFF0000;
        }
        gg.drawString(mc.font, cachedText, x, y, lastColor);
    }

    @Override public int getWidth() { return Minecraft.getInstance().font.width("FPS: 999"); }
    @Override public int getHeight() { return Minecraft.getInstance().font.lineHeight; }
}
