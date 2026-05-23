# Void Launcher — AGENTS.md

## Project structure

Two independent subprojects in one repo:

- **Electron launcher** (root): `main.js` (main process), `renderer.js` (renderer), `index.html`, `style.css`
- **Fabric mod** (`void-mod/`): Minecraft 1.21.11 HUD mod (keystrokes, armor, potions, crosshair)

## Commands

| Command | Works in | Description |
|---------|----------|-------------|
| `npm start` | root | Run Electron launcher |
| `npm run build` | root | Build Windows NSIS installer via electron-builder (outputs to `dist/`) |
| `.\gradlew.bat build` | `void-mod/` | Build Fabric mod JAR (`build/libs/keystrokes-1.0.0.jar`) |

## Mod build requirements

- JDK 23 required (`$env:JAVA_HOME = 'C:\Program Files\Java\jdk-23'`)
- Gradle 8.14 via wrapper, Fabric Loom 1.13.1, Mojang mappings
- On each launcher launch, the mod JAR is auto-copied from `void-mod/build/libs/` to `<gameDir>/mods/`

## Key architecture notes

- Launcher config stored in `launcher_config.json` (local) and `AppData/void-launcher/` (runtime)
- No tests, no linter, no typechecker, no CI workflows, no pre-commit hooks
- All build artifacts and runtime Minecraft data are gitignored (`.gitignore` at root)
- `main.js:93` — `createWindow()` creates a frameless, non-resizable 960×620 window with `nodeIntegration: true`
- Mod ID: `void-client`, settings key: RSHIFT, config saved to `.minecraft/config/void-client.json`
- CurseForge WebView is used for mod browsing (no API key needed)

## Config map

- `launcher_config.json` — local dev config (username, ram, skin path)
- `launcher_profiles.json` — gitignored (Minecraft runtime)
- `launcher_config.json` is also the pre-migration layout; the app migrates old format on first run (`main.js:54-83`)
