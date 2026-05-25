package io.voidlauncher.mod.mixin;

import io.voidlauncher.mod.gui.VoidCustomizationScreen;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

import java.lang.reflect.Method;

@Mixin(Screen.class)
public class OptionsScreenMixin {
    @Inject(method = "init", at = @At("TAIL"))
    private void voidClient$addVoidButton(CallbackInfo ci) {
        Screen screen = (Screen) (Object) this;
        String name = screen.getClass().getSimpleName();
        if (!name.equals("OptionsScreen") && !name.contains("Options")) return;

        Button btn = Button.builder(
            Component.literal("V"),
            b -> Minecraft.getInstance().setScreen(new VoidCustomizationScreen()))
            .bounds(screen.width - 28, 8, 20, 20)
            .build();

        for (var m : Screen.class.getDeclaredMethods()) {
            if (m.getParameterCount() == 1
                && m.getParameterTypes()[0].isInstance(btn)
                && m.getReturnType() != Void.TYPE) {
                try {
                    m.setAccessible(true);
                    m.invoke(screen, btn);
                    return;
                } catch (Exception ignored) {}
            }
        }
    }
}
