package io.voidlauncher.mod.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;

public class TimeModule extends HudModule {
    private String cachedText = "00:00";
    private int lastHours = -1, lastMinutes = -1;

    public TimeModule() {
        super(2, 98);
    }

    private static String pad2(int n) {
        return n < 10 ? "0" + n : Integer.toString(n);
    }

    @Override
    public void render(GuiGraphics gg) {
        var level = Minecraft.getInstance().level;
        if (level == null) return;
        long time = level.getDayTime() % 24000;
        int hours = (int) ((time / 1000 + 6) % 24);
        int minutes = (int) ((time % 1000) * 60 / 1000);
        if (hours != lastHours || minutes != lastMinutes) {
            lastHours = hours; lastMinutes = minutes;
            cachedText = pad2(hours) + ':' + pad2(minutes);
        }
        gg.drawString(Minecraft.getInstance().font, cachedText, x, y, color);
    }

    @Override public int getWidth() { return Minecraft.getInstance().font.width("23:59"); }
    @Override public int getHeight() { return Minecraft.getInstance().font.lineHeight; }
}
