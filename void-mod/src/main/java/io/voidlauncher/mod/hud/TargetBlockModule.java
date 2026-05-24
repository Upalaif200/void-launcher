package io.voidlauncher.mod.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;

public class TargetBlockModule extends HudModule {
    public TargetBlockModule() {
        super(2, 84);
    }

    @Override
    public void render(GuiGraphics gg) {
        var mc = Minecraft.getInstance();
        var hit = mc.hitResult;
        if (hit == null || hit.getType() == HitResult.Type.MISS) return;
        if (!(hit instanceof BlockHitResult bhr)) return;
        var pos = bhr.getBlockPos();
        var level = mc.level;
        if (level == null) return;
        var state = level.getBlockState(pos);
        var id = BuiltInRegistries.BLOCK.getKey(state.getBlock());
        gg.drawString(mc.font, id.toString(), x, y, color);
    }

    @Override public int getWidth() { return Minecraft.getInstance().font.width("minecraft:stone"); }
    @Override public int getHeight() { return Minecraft.getInstance().font.lineHeight; }
}
