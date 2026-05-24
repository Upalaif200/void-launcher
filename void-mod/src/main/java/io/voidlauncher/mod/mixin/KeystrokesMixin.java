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
public class KeystrokesMixin {
    @Inject(method = "render", at = @At("TAIL"))
    private void voidClient$onRender(GuiGraphics guiGraphics, DeltaTracker deltaTracker, CallbackInfo ci) {
        HudManager.getInstance().renderAll(guiGraphics);
    }
}
