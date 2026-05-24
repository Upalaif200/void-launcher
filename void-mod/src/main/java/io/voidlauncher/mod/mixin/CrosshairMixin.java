package io.voidlauncher.mod.mixin;

import io.voidlauncher.mod.hud.HudManager;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.gui.Gui;
import net.minecraft.client.gui.GuiGraphics;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(Gui.class)
public class CrosshairMixin {
    @Inject(method = "renderCrosshair", at = @At("HEAD"), cancellable = true)
    private void voidClient$onRenderCrosshair(GuiGraphics guiGraphics, DeltaTracker deltaTracker, CallbackInfo ci) {
        for (var mod : HudManager.getInstance().getModules()) {
            if (mod.isVisible() && mod.getClass().getSimpleName().equals("CrosshairModule")) {
                ci.cancel();
                return;
            }
        }
    }
}
