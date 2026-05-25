package io.voidlauncher.mod.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;

public class CoordinatesModule extends HudModule {
    private String cachedText = "X:0 Y:0 Z:0";
    private int lastX, lastY, lastZ;

    public CoordinatesModule() {
        super(2, 28);
    }

    @Override
    public void render(GuiGraphics gg) {
        var player = Minecraft.getInstance().player;
        if (player == null) return;
        var pos = player.blockPosition();
        int px = pos.getX(), py = pos.getY(), pz = pos.getZ();
        if (px != lastX || py != lastY || pz != lastZ) {
            lastX = px; lastY = py; lastZ = pz;
            cachedText = "X:" + px + " Y:" + py + " Z:" + pz;
        }
        gg.drawString(Minecraft.getInstance().font, cachedText, x, y, color);
    }

    @Override public int getWidth() { return Minecraft.getInstance().font.width("X:-9999 Y:999 Z:-9999"); }
    @Override public int getHeight() { return Minecraft.getInstance().font.lineHeight; }
}
