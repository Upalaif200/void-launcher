# Void Client HUD Mod

## Project Structure
```
void-mod/
├── build.gradle (Loom 1.13.1, Gradle 8.14, JDK 23, Mojmap)
├── gradle.properties (minecraft=1.21.11, loader=0.18.4, fabric-api=0.141.3+1.21.11)
└── src/main/
    ├── java/io/voidlauncher/mod/
    │   ├── KeystrokesMod.java       # Main mod class, registers modules + keybind
    │   ├── KeystrokesMixin.java     # Injects HUD render at Gui.render() TAIL
    │   ├── CrosshairMixin.java      # Cancels native crosshair when module enabled
    │   ├── hud/
    │   │   ├── HudModule.java       # Abstract base: position, visibility, color, render
    │   │   ├── HudManager.java      # Singleton, manages modules, saves config
    │   │   ├── ModuleConfig.java    # JSON persistence in .minecraft/config/void-client.json
    │   │   ├── KeystrokesModule.java # WASD + Space + Shift + Ctrl overlay
    │   │   ├── ArmorStatusModule.java # Armor items with durability bars
    │   │   ├── PotionStatusModule.java # Active potion effects list
    │   │   └── CrosshairModule.java  # Custom crosshair (4 lines, center screen)
    │   └── gui/
    │       └── HudSettingsScreen.java # Settings screen (toggle, color, save)
    └── resources/
        ├── fabric.mod.json (id: void-client)
        ├── void-keystrokes.mixins.json (KeystrokesMixin + CrosshairMixin)
        └── assets/keystrokes/icon.png

## Key Details
- Mod ID: `void-client`, JAR: `keystrokes-1.0.0.jar`
- Settings key: RSHIFT (opens HudSettingsScreen)
- Config saved to: `.minecraft/config/void-client.json`
- Depends on: fabric-loader >=0.18.4, minecraft =1.21.11, fabric-key-binding-api-v1, fabric-lifecycle-events-v1
- No more GLFW reflection for keystrokes - uses `KeyMapping.isDown()` via `Minecraft.getInstance().options.*`
- Launcher auto-copies JAR from `void-mod/build/libs/keystrokes-1.0.0.jar` to `<gameDir>/mods/` on each launch

## Build & Deploy
```
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-23'
cd D:\Launch\void-mod
.\gradlew.bat build
Copy-Item -Force build\libs\keystrokes-1.0.0.jar "$env:APPDATA\void-launcher\mods\keystrokes-1.0.0.jar"
```
