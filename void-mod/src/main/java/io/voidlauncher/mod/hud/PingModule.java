package io.voidlauncher.mod.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;

public class PingModule extends HudModule {
    private String cachedText = "SP";
    private int cachedColor = 0xFF808080;
    private int lastLatency = -1;
    private boolean wasConnected;

    public PingModule() {
        super(2, 70);
    }

    @Override
    public void render(GuiGraphics gg) {
        var mc = Minecraft.getInstance();
        var player = mc.player;
        if (player == null) return;
        var conn = mc.getConnection();
        if (conn == null) {
            if (wasConnected) { cachedText = "SP"; cachedColor = 0xFF808080; wasConnected = false; }
            gg.drawString(mc.font, cachedText, x, y, cachedColor);
            return;
        }
        if (!wasConnected) wasConnected = true;
        var info = conn.getPlayerInfo(player.getName().getString());
        if (info == null) {
            gg.drawString(mc.font, "SP", x, y, 0xFF808080);
            return;
        }
        int lat = info.getLatency();
        if (lat != lastLatency) {
            lastLatency = lat;
            cachedText = lat + "ms";
            cachedColor = color;
        }
        gg.drawString(mc.font, cachedText, x, y, cachedColor);
    }

    @Override public int getWidth() { return Minecraft.getInstance().font.width("999ms"); }
    @Override public int getHeight() { return Minecraft.getInstance().font.lineHeight; }
}
