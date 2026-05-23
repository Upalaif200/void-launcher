package io.voidlauncher.mod;

import io.voidlauncher.mod.gui.HudSettingsScreen;
import io.voidlauncher.mod.hud.*;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import org.lwjgl.glfw.GLFW;

public class KeystrokesMod implements ClientModInitializer {
    private static KeyMapping settingsKey;

    @Override
    public void onInitializeClient() {
        System.out.println("[Void-Client] Mod loaded");

        var mgr = HudManager.getInstance();
        mgr.register(new KeystrokesModule());
        mgr.register(new ArmorStatusModule());
        mgr.register(new PotionStatusModule());
        mgr.register(new CrosshairModule());

        settingsKey = KeyBindingHelper.registerKeyBinding(new KeyMapping(
            "key.void-client.settings",
            GLFW.GLFW_KEY_RIGHT_SHIFT,
            KeyMapping.Category.MISC
        ));

        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            if (settingsKey.consumeClick() && client.screen == null) {
                client.setScreen(new HudSettingsScreen());
            }
        });
    }
}