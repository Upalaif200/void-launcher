package io.voidlauncher.mod.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.ItemStack;

public class ArmorStatusModule extends HudModule {
    private static final int SLOT_SIZE = 18, PAD = 2;

    public ArmorStatusModule() {
        super(PAD, PAD);
    }

    @Override
    public void render(GuiGraphics gg) {
        var player = Minecraft.getInstance().player;
        if (player == null) return;

        var armor = new ItemStack[]{
            player.getItemBySlot(EquipmentSlot.FEET),
            player.getItemBySlot(EquipmentSlot.LEGS),
            player.getItemBySlot(EquipmentSlot.CHEST),
            player.getItemBySlot(EquipmentSlot.HEAD)
        };

        for (int i = 0; i < armor.length; i++) {
            int sx = x;
            int sy = y + i * (SLOT_SIZE + PAD);
            gg.renderItem(armor[i], sx + 1, sy + 1);
            if (armor[i].isDamageableItem()) {
                int dmg = armor[i].getDamageValue();
                int max = armor[i].getMaxDamage();
                float pct = 1f - (float) dmg / max;
                int barW = (int) (16 * pct);
                int barX = sx + 1;
                int barY = sy + 14;
                int barColor = pct > 0.6f ? 0xFF00FF00 : pct > 0.2f ? 0xFFFFFF00 : 0xFFFF0000;
                gg.fill(barX, barY, barX + barW, barY + 2, 0xFF000000);
                gg.fill(barX + 1, barY + 1, barX + barW - 1, barY + 1, barColor);
            }
        }
    }

    @Override public int getWidth() { return SLOT_SIZE + PAD; }
    @Override public int getHeight() { return 4 * (SLOT_SIZE + PAD); }
}