package io.voidlauncher.mod.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.multiplayer.PlayerInfo;

public class PingModule extends HudModule {
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
            gg.drawString(mc.font, "SP", x, y, 0xFF808080);
            return;
        }
        PlayerInfo info = conn.getPlayerInfo(player.getGameProfile().getId());
        if (info == null) {
            gg.drawString(mc.font, "SP", x, y, 0xFF808080);
            return;
        }
        String text = info.getLatency() + "ms";
        gg.drawString(mc.font, text, x, y, color);
    }

    @Override public int getWidth() { return Minecraft.getInstance().font.width("999ms"); }
    @Override public int getHeight() { return Minecraft.getInstance().font.lineHeight; }
}
