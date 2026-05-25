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
    private static HudManager cachedHud;

    @Inject(method = "renderCrosshair", at = @At("HEAD"), cancellable = true)
    private void voidClient$onRenderCrosshair(GuiGraphics guiGraphics, DeltaTracker deltaTracker, CallbackInfo ci) {
        var mgr = cachedHud;
        if (mgr == null) cachedHud = mgr = HudManager.getInstance();
        var cm = mgr.getCrosshairModule();
        if (cm != null && cm.isVisible()) ci.cancel();
    }
}
