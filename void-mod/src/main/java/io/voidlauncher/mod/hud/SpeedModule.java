package io.voidlauncher.mod.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;

public class SpeedModule extends HudModule {
    private double prevX, prevZ;
    private boolean hasPrev;

    public SpeedModule() {
        super(2, 56);
    }

    @Override
    public void render(GuiGraphics gg) {
        var player = Minecraft.getInstance().player;
        if (player == null) return;
        double dx = player.getX() - prevX;
        double dz = player.getZ() - prevZ;
        if (hasPrev) {
            double speed = Math.sqrt(dx * dx + dz * dz) * 20.0;
            String text = String.format("%.1f b/s", speed);
            gg.drawString(Minecraft.getInstance().font, text, x, y, color);
        }
        prevX = player.getX();
        prevZ = player.getZ();
        hasPrev = true;
    }

    @Override public int getWidth() { return Minecraft.getInstance().font.width("99.9 b/s"); }
    @Override public int getHeight() { return Minecraft.getInstance().font.lineHeight; }
}
