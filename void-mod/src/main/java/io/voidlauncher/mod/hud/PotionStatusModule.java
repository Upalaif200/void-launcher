package io.voidlauncher.mod.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.core.Holder;
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

        int i = 0;
        var font = Minecraft.getInstance().font;
        for (MobEffectInstance effect : effects) {
            var name = effect.getEffect().value().getDisplayName().getString();
            int lvl = effect.getAmplifier() + 1;
            int sec = effect.getDuration() / 20;
            String text = name + " " + lvl + " (" + sec + "s)";
            gg.drawString(font, text, x, y + i * font.lineHeight, color);
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