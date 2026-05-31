// skin3d.js — Visor 3D de skin y Editor de skin de Minecraft

function createSkinViewer(container, width, height) {
    let THREE;
    try { THREE = require('three'); } catch (e) { console.warn('[SKIN3D] THREE.js no disponible:', e.message); return null; }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 0, 40);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    container.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(5, 10, 5);
    scene.add(dirLight);

    const character = new THREE.Group();
    scene.add(character);

    let currentTexture = null;
    let animFrame = null;
    let rotY = 0;

    const sharedMat = new THREE.MeshLambertMaterial({ transparent: true, alphaTest: 0.05 });

    const texLoader = new THREE.TextureLoader();
    texLoader.setCrossOrigin('anonymous');

    function makeBox(w, h, d, faceUVs, texture, tx = 64, ty = 64) {
        const geo = new THREE.BoxGeometry(w, h, d);
        const uvAttr = geo.attributes.uv;

        for (let face = 0; face < 6; face++) {
            const [sx, sy, sw, sh] = faceUVs[face];
            const u0 = sx / tx, u1 = (sx + sw) / tx;
            const v0 = 1 - (sy + sh) / ty, v1 = 1 - sy / ty;

            const base = face * 4;
            uvAttr.setXY(base + 0, u0, v1);
            uvAttr.setXY(base + 1, u1, v1);
            uvAttr.setXY(base + 2, u0, v0);
            uvAttr.setXY(base + 3, u1, v0);
        }
        uvAttr.needsUpdate = true;

        const mat = sharedMat.clone();
        mat.map = texture;
        return new THREE.Mesh(geo, mat);
    }

    function buildCharacter(texture) {
        while (character.children.length) {
            const child = character.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
            character.remove(child);
        }

        const S = 1;
        const parts = [
            { w: 8*S, h: 8*S, d: 8*S, uvs: [[16,8,8,8],[0,8,8,8],[8,0,8,8],[16,0,8,8],[8,8,8,8],[24,8,8,8]], pos: [0,10*S,0] },
            { w: 8*S, h:12*S, d: 4*S, uvs: [[28,20,4,12],[16,20,4,12],[20,16,8,4],[28,16,8,4],[20,20,8,12],[32,20,8,12]], pos: [0,0,0] },
            { w: 4*S, h:12*S, d: 4*S, uvs: [[48,20,4,12],[40,20,4,12],[44,16,4,4],[48,16,4,4],[44,20,4,12],[52,20,4,12]], pos: [-6*S,0,0] },
            { w: 4*S, h:12*S, d: 4*S, uvs: [[36,52,4,12],[44,52,4,12],[36,48,4,4],[40,48,4,4],[44,52,4,12],[48,52,4,12]], pos: [6*S,0,0] },
            { w: 4*S, h:12*S, d: 4*S, uvs: [[8,20,4,12],[0,20,4,12],[4,16,4,4],[8,16,4,4],[4,20,4,12],[12,20,4,12]], pos: [-2*S,-12*S,0] },
            { w: 4*S, h:12*S, d: 4*S, uvs: [[20,52,4,12],[28,52,4,12],[20,48,4,4],[24,48,4,4],[24,52,4,12],[28,52,4,12]], pos: [2*S,-12*S,0] }
        ];

        for (const p of parts) {
            const mesh = makeBox(p.w, p.h, p.d, p.uvs, texture);
            mesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
            character.add(mesh);
        }
        character.position.set(0, 2*S, 0);
    }

    function loadSkin(src) {
        texLoader.load(
            src,
            (tex) => {
                tex.magFilter = THREE.NearestFilter;
                tex.minFilter = THREE.NearestFilter;
                if (currentTexture) currentTexture.dispose();
                currentTexture = tex;
                buildCharacter(tex);
            },
            undefined,
            (err) => console.warn('[SKIN3D] Error cargando textura:', src, err)
        );
    }

    let isDragging = false;
    let prevX = 0;
    const onDown = (e) => { isDragging = true; prevX = e.clientX; };
    const onMove = (e) => {
        if (!isDragging) return;
        rotY += (e.clientX - prevX) * 0.01;
        prevX = e.clientX;
    };
    const onUp = () => isDragging = false;
    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseup', onUp);
    canvas.addEventListener('mouseleave', onUp);

    let walkPhase = 0;
    let hidden = false;
    const onVisibility = () => {
        hidden = document.hidden;
        if (hidden && animFrame !== null) { cancelAnimationFrame(animFrame); animFrame = null; }
        else if (!hidden) animate();
    };
    document.addEventListener('visibilitychange', onVisibility);

    function animate() {
        if (hidden) return;
        animFrame = requestAnimationFrame(animate);

        if (!isDragging) rotY += 0.008;
        character.rotation.y = rotY;

        walkPhase += 0.05;
        if (character.children.length >= 6) {
            const swing = Math.sin(walkPhase) * 0.4;
            character.children[2].rotation.x = swing;
            character.children[3].rotation.x = -swing;
            character.children[4].rotation.x = -swing;
            character.children[5].rotation.x = swing;
        }

        renderer.render(scene, camera);
    }
    animate();

    return {
        loadSkin,
        destroy() {
            cancelAnimationFrame(animFrame);
            document.removeEventListener('visibilitychange', onVisibility);
            canvas.removeEventListener('mousedown', onDown);
            canvas.removeEventListener('mousemove', onMove);
            canvas.removeEventListener('mouseup', onUp);
            canvas.removeEventListener('mouseleave', onUp);
            renderer.dispose();
            canvas.remove();
        }
    };
}

// ── EDITOR DE SKIN 3D (Nova-Style) ──

function createSkinEditor(container, initialSkinPath) {
    const THREE = require('three');

    const W = container.clientWidth || 600;
    const H = container.clientHeight || 500;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d0a1a);

    const camera = new THREE.PerspectiveCamera(35, W / H, 0.1, 100);
    camera.position.set(0, 1, 38);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(5, 10, 5);
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0x8888ff, 0.2);
    fillLight.position.set(-5, 0, -5);
    scene.add(fillLight);

    const character = new THREE.Group();
    scene.add(character);

    // ── Editable texture canvases ──
    const TEX = 64;
    const innerCanvas = document.createElement('canvas');
    innerCanvas.width = innerCanvas.height = TEX;
    const innerCtx = innerCanvas.getContext('2d');
    const outerCanvas = document.createElement('canvas');
    outerCanvas.width = outerCanvas.height = TEX;
    const outerCtx = outerCanvas.getContext('2d');
    const compCanvas = document.createElement('canvas');
    compCanvas.width = compCanvas.height = TEX;
    const compCtx = compCanvas.getContext('2d');

    function composite() {
        compCtx.clearRect(0, 0, TEX, TEX);
        compCtx.drawImage(innerCanvas, 0, 0);
        if (layersVisible.outer) compCtx.drawImage(outerCanvas, 0, 0);
    }

    function initDefaultSkin() {
        innerCtx.fillStyle = '#c68b6c';
        innerCtx.fillRect(8, 8, 8, 8);
        innerCtx.fillRect(20, 8, 8, 8);
        innerCtx.fillStyle = '#6cb4c6';
        innerCtx.fillRect(40, 8, 8, 12);
        innerCtx.fillRect(16, 20, 8, 12);
        innerCtx.fillStyle = '#3b7a9e';
        innerCtx.fillRect(20, 20, 8, 12);
        innerCtx.fillStyle = '#4a6b8c';
        innerCtx.fillRect(36, 20, 8, 12);
        innerCtx.fillStyle = '#4a6b8c';
        innerCtx.fillRect(44, 20, 8, 12);
        innerCtx.fillStyle = '#3b5c7a';
        innerCtx.fillRect(0, 20, 8, 12);
        innerCtx.fillRect(8, 52, 8, 12);
        innerCtx.fillRect(20, 52, 8, 12);
        innerCtx.fillStyle = '#2d4a6b';
        innerCtx.fillRect(4, 20, 4, 12);
        innerCtx.fillRect(12, 20, 4, 12);
        innerCtx.fillStyle = '#ffffff';
        innerCtx.fillRect(12, 12, 2, 2);
        innerCtx.fillRect(20, 12, 2, 2);
        outerCtx.clearRect(0, 0, TEX, TEX);
        composite();
    }
    initDefaultSkin();

    const canvasTex = new THREE.CanvasTexture(compCanvas);
    canvasTex.magFilter = THREE.NearestFilter;
    canvasTex.minFilter = THREE.NearestFilter;

    // ── Build character ──
    const PART_NAMES = ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
    const meshes = [];

    function makeBox(w, h, d, faceUVs, texture, tx, ty) {
        tx = tx || TEX; ty = ty || TEX;
        const geo = new THREE.BoxGeometry(w, h, d);
        const uvAttr = geo.attributes.uv;
        for (let face = 0; face < 6; face++) {
            const [sx, sy, sw, sh] = faceUVs[face];
            const u0 = sx / tx, u1 = (sx + sw) / tx;
            const v0 = 1 - (sy + sh) / ty, v1 = 1 - sy / ty;
            const base = face * 4;
            uvAttr.setXY(base + 0, u0, v1);
            uvAttr.setXY(base + 1, u1, v1);
            uvAttr.setXY(base + 2, u0, v0);
            uvAttr.setXY(base + 3, u1, v0);
        }
        uvAttr.needsUpdate = true;
        const mat = new THREE.MeshLambertMaterial({ map: texture, transparent: true, alphaTest: 0.05 });
        return new THREE.Mesh(geo, mat);
    }

    function buildCharacter() {
        while (character.children.length) {
            const c = character.children[0];
            if (c.geometry) c.geometry.dispose();
            if (c.material) c.material.dispose();
            character.remove(c);
        }
        meshes.length = 0;

        const S = 1;
        const parts = [
            { w: 8*S, h: 8*S, d: 8*S, uvs: [[16,8,8,8],[0,8,8,8],[8,0,8,8],[16,0,8,8],[8,8,8,8],[24,8,8,8]], pos: [0,10*S,0] },
            { w: 8*S, h:12*S, d: 4*S, uvs: [[28,20,4,12],[16,20,4,12],[20,16,8,4],[28,16,8,4],[20,20,8,12],[32,20,8,12]], pos: [0,0,0] },
            { w: 4*S, h:12*S, d: 4*S, uvs: [[48,20,4,12],[40,20,4,12],[44,16,4,4],[48,16,4,4],[44,20,4,12],[52,20,4,12]], pos: [-6*S,0,0] },
            { w: 4*S, h:12*S, d: 4*S, uvs: [[36,52,4,12],[44,52,4,12],[36,48,4,4],[40,48,4,4],[44,52,4,12],[48,52,4,12]], pos: [6*S,0,0] },
            { w: 4*S, h:12*S, d: 4*S, uvs: [[8,20,4,12],[0,20,4,12],[4,16,4,4],[8,16,4,4],[4,20,4,12],[12,20,4,12]], pos: [-2*S,-12*S,0] },
            { w: 4*S, h:12*S, d: 4*S, uvs: [[20,52,4,12],[28,52,4,12],[20,48,4,4],[24,48,4,4],[24,52,4,12],[28,52,4,12]], pos: [2*S,-12*S,0] }
        ];

        for (let i = 0; i < parts.length; i++) {
            const p = parts[i];
            const mesh = makeBox(p.w, p.h, p.d, p.uvs, canvasTex);
            mesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
            mesh.userData.partIndex = i;
            character.add(mesh);
            meshes.push(mesh);
        }
        character.position.set(0, 2, 0);
    }

    // ── Load initial skin ──
    function loadSkinOntoCanvas(src) {
        const img = new Image();
        img.onload = () => {
            innerCtx.clearRect(0, 0, TEX, TEX);
            innerCtx.drawImage(img, 0, 0);
            composite();
            canvasTex.needsUpdate = true;
        };
        img.onerror = () => {
            composite();
            canvasTex.needsUpdate = true;
        };
        if (src.startsWith('file://') || src.startsWith('http://') || src.startsWith('https://')) {
            img.src = src;
        } else {
            img.src = 'file://' + src;
        }
    }

    buildCharacter();
    if (initialSkinPath) loadSkinOntoCanvas(initialSkinPath);

    // ── State ──
    let currentTool = 'pencil';
    let currentColor = '#ff6600';
    let brushSize = 1;
    let activeLayer = 'inner';
    let layersVisible = { inner: true, outer: true };
    let isolatedPart = 'all';

    // ── Undo / Redo ──
    const MAX_UNDO = 50;
    const undoStack = [];
    const redoStack = [];

    function snapshot() {
        undoStack.push({
            inner: innerCtx.getImageData(0, 0, TEX, TEX),
            outer: outerCtx.getImageData(0, 0, TEX, TEX)
        });
        if (undoStack.length > MAX_UNDO) undoStack.shift();
        redoStack.length = 0;
    }

    // ── Pixel helpers ──
    function hexToRGBA(hex, a) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return [r, g, b, a != null ? a : 255];
    }

    function setPixel(data, x, y, rgba) {
        const i = (y * TEX + x) * 4;
        data[i] = rgba[0];
        data[i + 1] = rgba[1];
        data[i + 2] = rgba[2];
        data[i + 3] = rgba[3];
    }

    function drawCirclePixels(data, cx, cy, r, rgba) {
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                if (dx * dx + dy * dy <= r * r) {
                    const x = cx + dx, y = cy + dy;
                    if (x >= 0 && x < TEX && y >= 0 && y < TEX) setPixel(data, x, y, rgba);
                }
            }
        }
    }

    function drawThickLine(data, x0, y0, x1, y1, r, rgba) {
        const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
        for (let s = 0; s <= steps; s++) {
            const t = steps === 0 ? 0 : s / steps;
            const x = Math.round(x0 + (x1 - x0) * t);
            const y = Math.round(y0 + (y1 - y0) * t);
            drawCirclePixels(data, x, y, r, rgba);
        }
    }

    // ── Flood fill ──
    function floodFill(data, startX, startY, fill) {
        const w = TEX, h = TEX;
        const targetIdx = (startY * w + startX) * 4;
        const tr = data[targetIdx], tg = data[targetIdx + 1], tb = data[targetIdx + 2], ta = data[targetIdx + 3];
        if (tr === fill[0] && tg === fill[1] && tb === fill[2] && ta === fill[3]) return;

        const visited = new Uint8Array(w * h);
        const stack = [[startX, startY]];

        while (stack.length) {
            const [x, y] = stack.pop();
            if (x < 0 || x >= w || y < 0 || y >= h) continue;
            const vi = y * w + x;
            if (visited[vi]) continue;
            const pi = vi * 4;
            if (data[pi] !== tr || data[pi + 1] !== tg || data[pi + 2] !== tb || data[pi + 3] !== ta) continue;
            visited[vi] = 1;
            setPixel(data, x, y, fill);
            stack.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
        }
    }

    // ── Raycaster ──
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    function uvToPixel(u, v) {
        return {
            x: Math.min(63, Math.max(0, Math.floor(u * TEX))),
            y: Math.min(63, Math.max(0, Math.floor((1 - v) * TEX)))
        };
    }

    function getHit(clientX, clientY) {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(meshes, false);
        if (hits.length && hits[0].uv) {
            const h = hits[0];
            return {
                uv: h.uv,
                pixel: uvToPixel(h.uv.x, h.uv.y),
                partIndex: h.object.userData.partIndex
            };
        }
        return null;
    }

    // ── Painting ──
    let isDown = false;
    let lastPx = null;

    function doPaint(pixel) {
        const ctx = activeLayer === 'outer' ? outerCtx : innerCtx;
        const imageData = ctx.getImageData(0, 0, TEX, TEX);

        if (currentTool === 'eyedropper') {
            const i = (pixel.y * TEX + pixel.x) * 4;
            const r = imageData.data[i], g = imageData.data[i + 1], b = imageData.data[i + 2];
            currentColor = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
            const picker = document.getElementById('editor-color-picker');
            const hexInput = document.getElementById('editor-color-hex');
            if (picker) picker.value = currentColor;
            if (hexInput) hexInput.value = currentColor;
            return;
        }

        const isEraser = currentTool === 'eraser';
        const rgba = isEraser ? [0, 0, 0, 0] : hexToRGBA(currentColor, 255);
        const r = isEraser || currentTool === 'pencil' ? 0 : brushSize - 1;

        if (currentTool === 'bucket') {
            floodFill(imageData, pixel.x, pixel.y, rgba);
        } else if (isEraser || currentTool === 'pencil' || currentTool === 'brush') {
            drawCirclePixels(imageData, pixel.x, pixel.y, r, rgba);
        }

        ctx.putImageData(imageData, 0, 0);
        composite();
        canvasTex.needsUpdate = true;
    }

    function onPointerDown(e) {
        if (e.button !== 0) return;
        const hit = getHit(e.clientX, e.clientY);
        if (!hit) return;
        if (isolatedPart !== 'all' && hit.partIndex !== PART_NAMES.indexOf(isolatedPart)) return;
        isDown = true;
        lastPx = hit.pixel;
        snapshot();
        doPaint(hit.pixel);
    }

    function onPointerMove(e) {
        if (!isDown || orbitDown) return;
        const hit = getHit(e.clientX, e.clientY);
        if (!hit) return;
        if (isolatedPart !== 'all' && hit.partIndex !== PART_NAMES.indexOf(isolatedPart)) return;
        const p = hit.pixel;
        if (p.x !== lastPx.x || p.y !== lastPx.y) {
            const ctx = activeLayer === 'outer' ? outerCtx : innerCtx;
            const imageData = ctx.getImageData(0, 0, TEX, TEX);
            const isEraser = currentTool === 'eraser';
            const rgba = isEraser ? [0, 0, 0, 0] : hexToRGBA(currentColor, 255);
            const r = isEraser || currentTool === 'pencil' ? 0 : brushSize - 1;
            drawThickLine(imageData, lastPx.x, lastPx.y, p.x, p.y, r, rgba);
            ctx.putImageData(imageData, 0, 0);
            composite();
            canvasTex.needsUpdate = true;
            lastPx = p;
        }
    }

    function onPointerUp(e) { if (e.button === 2) return; isDown = false; lastPx = null; }

    const el = renderer.domElement;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointerleave', onPointerUp);

    // ── Camera orbit ──
    let orbitDown = false;
    let orbitPrevX = 0;
    let rotY = 0;

    el.addEventListener('contextmenu', e => e.preventDefault());

    el.addEventListener('pointerdown', e => {
        if (e.button === 2) { orbitDown = true; orbitPrevX = e.clientX; }
    });
    el.addEventListener('pointermove', e => {
        if (orbitDown) {
            rotY += (e.clientX - orbitPrevX) * 0.01;
            orbitPrevX = e.clientX;
        }
    });
    el.addEventListener('pointerup', e => { if (e.button === 2) orbitDown = false; });
    el.addEventListener('pointerleave', () => { orbitDown = false; });

    // ── Animation loop ──
    let hidden = false;
    function animate() {
        if (!hidden) requestAnimationFrame(animate);
        character.rotation.y = rotY;
        renderer.render(scene, camera);
    }
    animate();

    document.addEventListener('visibilitychange', () => {
        hidden = document.hidden;
        if (!hidden) animate();
    });

    // ── Isolate parts visual ──
    function updateIsolation() {
        for (let i = 0; i < meshes.length; i++) {
            if (isolatedPart === 'all' || PART_NAMES[i] === isolatedPart) {
                meshes[i].material.opacity = 1;
            } else {
                meshes[i].material.opacity = 0.15;
            }
        }
    }

    // ── Public API ──
    return {
        setTool(tool) { currentTool = tool; },
        setColor(color) { currentColor = color; },
        setBrushSize(size) { brushSize = size; },
        setActiveLayer(layer) { activeLayer = layer; },
        toggleLayer(layer, visible) {
            layersVisible[layer] = visible;
            composite();
            canvasTex.needsUpdate = true;
        },
        isolatePart(part) {
            isolatedPart = part;
            updateIsolation();
        },
        undo() {
            if (!undoStack.length) return;
            redoStack.push({
                inner: innerCtx.getImageData(0, 0, TEX, TEX),
                outer: outerCtx.getImageData(0, 0, TEX, TEX)
            });
            const s = undoStack.pop();
            innerCtx.putImageData(s.inner, 0, 0);
            outerCtx.putImageData(s.outer, 0, 0);
            composite();
            canvasTex.needsUpdate = true;
        },
        redo() {
            if (!redoStack.length) return;
            undoStack.push({
                inner: innerCtx.getImageData(0, 0, TEX, TEX),
                outer: outerCtx.getImageData(0, 0, TEX, TEX)
            });
            const s = redoStack.pop();
            innerCtx.putImageData(s.inner, 0, 0);
            outerCtx.putImageData(s.outer, 0, 0);
            composite();
            canvasTex.needsUpdate = true;
        },
        async importSkin(filePath) {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = 'file://' + filePath;
            });
            innerCtx.clearRect(0, 0, TEX, TEX);
            outerCtx.clearRect(0, 0, TEX, TEX);
            innerCtx.drawImage(img, 0, 0);
            composite();
            canvasTex.needsUpdate = true;
        },
        async exportSkin() {
            composite();
            const blob = await new Promise(r => compCanvas.toBlob(r, 'image/png'));
            const ab = await blob.arrayBuffer();
            const uint8 = new Uint8Array(ab);
            const result = await window.ipcRenderer.invoke('save-skin-file', { data: Array.from(uint8) });
            return result;
        },
        destroy() {
            hidden = true;
            el.removeEventListener('pointerdown', onPointerDown);
            el.removeEventListener('pointermove', onPointerMove);
            el.removeEventListener('pointerup', onPointerUp);
            el.removeEventListener('pointerleave', onPointerUp);
            renderer.dispose();
            if (el.parentNode) el.parentNode.removeChild(el);
        }
    };
}

module.exports = { createSkinViewer, createSkinEditor };
