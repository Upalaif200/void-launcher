package io.voidlauncher.mod.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;

public class TimeModule extends HudModule {
    public TimeModule() {
        super(2, 98);
    }

    @Override
    public void render(GuiGraphics gg) {
        var level = Minecraft.getInstance().level;
        if (level == null) return;
        long time = level.getDayTime() % 24000;
        int hours = (int) ((time / 1000 + 6) % 24);
        int minutes = (int) ((time % 1000) * 60 / 1000);
        String text = String.format("%02d:%02d", hours, minutes);
        gg.drawString(Minecraft.getInstance().font, text, x, y, color);
    }

    @Override public int getWidth() { return Minecraft.getInstance().font.width("23:59"); }
    @Override public int getHeight() { return Minecraft.getInstance().font.lineHeight; }
}
