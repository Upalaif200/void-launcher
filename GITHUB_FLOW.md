# GitHub Flow — Void Launcher

Este repositorio sigue **GitHub Flow** para gestionar cambios, commits y actualizaciones.

## Flujo de trabajo

```
main ───●──────────────────────────────●───
         \                            /
feature  └──●──●──●──●──●──●──●──●──●─┘
           commit  commit  ...   PR merge
```

### 1. Crear una rama desde `main`

```
git checkout main
git pull origin main
git checkout -b nombre-de-la-rama
```

- Usa nombres descriptivos: `fix/login-error`, `feat/skin-preview`, `refactor/main-js`
- Separa palabras con guiones (`kebab-case`)

### 2. Hacer cambios y commits

```
git add .
git commit -m "Mensaje descriptivo del cambio"
git push origin nombre-de-la-rama
```

- Commits pequeños y atómicos (un cambio lógico por commit)
- Mensajes en presente imperativo: "Fix login validation", no "Fixed" ni "Fixing"

### 3. Abrir un Pull Request (PR) en GitHub

- Al subir la rama, GitHub muestra un botón para crear PR
- Título claro: resume el cambio
- Descripción opcional: contexto si es necesario

### 4. Revisar y discutir

- Comentar líneas específicas si hay dudas
- Si hay cambios solicitados, hacer commits nuevos en la misma rama

### 5. Merge a `main`

- Una vez aprobado, hacer merge con `Squash and merge` (opcional) o `Create a merge commit`
- Eliminar la rama después del merge (GitHub ofrece botón)

### 6. Actualizar local

```
git checkout main
git pull origin main
```

## Convenciones para este proyecto

| Tipo | Prefijo | Ejemplo |
|------|---------|---------|
| Nueva funcionalidad | `feat:` | `feat: add skin preview` |
| Corrección | `fix:` | `fix: ram slider not updating` |
| Refactor | `refactor:` | `refactor: extract launch logic` |
| Mod el | `mod:` | `mod: add potion status module` |
| Configuración | `chore:` | `chore: update electron-builder config` |
| Documentación | `docs:` | `docs: update AGENTS.md` |

## Notas específicas del proyecto

- **Electron (raíz):** cambios en `main.js`, `renderer.js`, `index.html`, `style.css`
- **Mod Fabric (`void-mod/`):** cambios en `src/main/java/` y `build.gradle`
- No hay tests, linter ni CI — confiar en revisión manual en PR
- `.gitignore` excluye `node_modules/`, `dist/`, `void-mod/build/`, `void-mod/.gradle/`, `*.jar`, etc.
