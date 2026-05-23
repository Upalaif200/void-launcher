package io.voidlauncher.mod.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;

public class FpsModule extends HudModule {
    public FpsModule() {
        super(2, 2);
    }

    @Override
    public void render(GuiGraphics gg) {
        var mc = Minecraft.getInstance();
        int fps = mc.getFps();
        String text = "FPS: " + fps;
        int c;
        if (fps >= 60) c = 0xFF00FF00;
        else if (fps >= 30) c = 0xFFFFFF00;
        else c = 0xFFFF0000;
        gg.drawString(mc.font, text, x, y, c);
    }

    @Override public int getWidth() { return Minecraft.getInstance().font.width("FPS: 999"); }
    @Override public int getHeight() { return Minecraft.getInstance().font.lineHeight; }
}
