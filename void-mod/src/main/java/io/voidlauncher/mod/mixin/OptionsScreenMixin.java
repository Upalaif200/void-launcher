package io.voidlauncher.mod.mixin;

import io.voidlauncher.mod.gui.VoidCustomizationScreen;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.events.GuiEventListener;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(Screen.class)
public abstract class OptionsScreenMixin {
    @Shadow
    protected abstract <T extends GuiEventListener> T addRenderableWidget(T widget);

    @Inject(method = "init", at = @At("TAIL"))
    private void voidClient$addVoidButton(CallbackInfo ci) {
        Screen screen = (Screen) (Object) this;
        String name = screen.getClass().getSimpleName();
        if (!name.equals("OptionsScreen") && !name.contains("Options")) return;

        Button btn = Button.builder(
            Component.literal("Void Client"),
            b -> Minecraft.getInstance().setScreen(new VoidCustomizationScreen()))
            .bounds(screen.width / 2 - 100, screen.height - 50, 200, 20)
            .build();

        addRenderableWidget(btn);
    }
}
