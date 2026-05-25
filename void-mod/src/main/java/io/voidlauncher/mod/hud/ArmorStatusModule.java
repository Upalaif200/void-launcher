package io.voidlauncher.mod.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.ItemStack;

public class ArmorStatusModule extends HudModule {
    private static final int SLOT_SIZE = 18, PAD = 2;
    private static final int COMPACT_SIZE = 12, COMPACT_PAD = 1;

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

        switch (form) {
            case 0 -> renderVertical(gg, armor);
            case 1 -> renderHorizontal(gg, armor);
            case 2 -> renderCompact(gg, armor);
        }
    }

    private void renderVertical(GuiGraphics gg, ItemStack[] armor) {
        float s = getRenderScale();
        int size = Math.round(SLOT_SIZE * s);
        int pad = Math.max(1, Math.round(PAD * s));

        for (int i = 0; i < armor.length; i++) {
            int sx = x;
            int sy = y + i * (size + pad);
            gg.renderItem(armor[i], sx + 1, sy + 1);
            if (armor[i].isDamageableItem()) {
                renderDurabilityBar(gg, armor[i], sx + 1, sy + size - 2, size - 2);
            }
        }
    }

    private void renderHorizontal(GuiGraphics gg, ItemStack[] armor) {
        float s = getRenderScale();
        int size = Math.round(SLOT_SIZE * s);
        int pad = Math.max(1, Math.round(PAD * s));

        for (int i = 0; i < armor.length; i++) {
            int sx = x + i * (size + pad);
            int sy = y;
            gg.renderItem(armor[i], sx + 1, sy + 1);
            if (armor[i].isDamageableItem()) {
                renderDurabilityBar(gg, armor[i], sx + 1, sy + size - 2, size - 2);
            }
        }
    }

    private void renderCompact(GuiGraphics gg, ItemStack[] armor) {
        float s = getRenderScale();
        int size = Math.round(COMPACT_SIZE * s);
        int pad = Math.max(1, Math.round(COMPACT_PAD * s));

        for (int i = 0; i < armor.length; i++) {
            int sx = x;
            int sy = y + i * (size + pad);
            gg.renderItem(armor[i], sx, sy);
        }
    }

    private void renderDurabilityBar(GuiGraphics gg, ItemStack stack, int bx, int by, int maxW) {
        int dmg = stack.getDamageValue();
        int max = stack.getMaxDamage();
        float pct = 1f - (float) dmg / max;
        int barW = (int) (maxW * pct);
        int barColor = pct > 0.6f ? 0xFF00FF00 : pct > 0.2f ? 0xFFFFFF00 : 0xFFFF0000;
        barColor = applyAlpha(barColor);
        gg.fill(bx, by, bx + barW, by + 2, applyAlpha(0xFF000000));
        gg.fill(bx + 1, by + 1, bx + barW - 1, by + 1, barColor);
    }

    @Override
    public int getWidth() {
        float s = getRenderScale();
        return switch (form) {
            case 1 -> Math.round((4 * SLOT_SIZE + 3 * PAD) * s);
            case 2 -> Math.round(COMPACT_SIZE * s);
            default -> Math.round((SLOT_SIZE + PAD) * s);
        };
    }

    @Override
    public int getHeight() {
        float s = getRenderScale();
        return switch (form) {
            case 1 -> Math.round((SLOT_SIZE + PAD) * s);
            case 2 -> Math.round((4 * COMPACT_SIZE + 3 * COMPACT_PAD) * s);
            default -> Math.round((4 * (SLOT_SIZE + PAD)) * s);
        };
    }
}
