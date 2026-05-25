package io.voidlauncher.mod.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;

public class SpeedModule extends HudModule {
    private double prevX, prevZ;
    private boolean hasPrev;
    private String cachedText = "0.0 b/s";
    private int cachedTicks;

    public SpeedModule() {
        super(2, 56);
    }

    @Override
    public void render(GuiGraphics gg) {
        var player = Minecraft.getInstance().player;
        if (player == null) return;
        double px = player.getX(), pz = player.getZ();
        if (hasPrev && (px != prevX || pz != prevZ || cachedTicks-- <= 0)) {
            double dx = px - prevX;
            double dz = pz - prevZ;
            double speed = Math.sqrt(dx * dx + dz * dz) * 20.0;
            cachedText = String.format("%.1f b/s", speed);
            cachedTicks = 5;
        } else if (!hasPrev) {
            cachedText = "0.0 b/s";
        }
        prevX = px;
        prevZ = pz;
        hasPrev = true;
        gg.drawString(Minecraft.getInstance().font, cachedText, x, y, color);
    }

    @Override public int getWidth() { return Minecraft.getInstance().font.width("99.9 b/s"); }
    @Override public int getHeight() { return Minecraft.getInstance().font.lineHeight; }
}
