package io.voidlauncher.mod.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.world.effect.MobEffectInstance;

public class PotionStatusModule extends HudModule {
    public PotionStatusModule() {
        super(0, 0);
    }

    @Override
    public void render(GuiGraphics gg) {
        var player = Minecraft.getInstance().player;
        if (player == null) return;
        var effects = player.getActiveEffects();
        if (effects.isEmpty()) return;
        var font = Minecraft.getInstance().font;
        var sb = new StringBuilder(32);
        int i = 0;
        for (MobEffectInstance effect : effects) {
            sb.setLength(0);
            sb.append(effect.getEffect().value().getDisplayName().getString()).append(' ')
              .append(effect.getAmplifier() + 1).append(" (").append(effect.getDuration() / 20).append("s)");
            gg.drawString(font, sb.toString(), x, y + i * font.lineHeight, color);
            i++;
        }
    }

    @Override public int getWidth() { return 100; }
    @Override public int getHeight() {
        var player = Minecraft.getInstance().player;
        if (player == null) return 0;
        return player.getActiveEffects().size() * Minecraft.getInstance().font.lineHeight;
    }
}
