// skin3d.js — Visor 3D de skin de Minecraft usando Three.js puro
// Sin dependencias externas problemáticas, todo en un archivo

function createSkinViewer(container, width, height) {
    const THREE = require('three');

    // ── Escena ──
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

    // ── Cámara ──
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 0, 40);

    // ── Renderer ──
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    container.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio || 1);

    // ── Luz ──
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(5, 10, 5);
    scene.add(dirLight);

    // ── Grupo del personaje ──
    const character = new THREE.Group();
    scene.add(character);

    let currentTexture = null;
    let animFrame = null;
    let rotY = 0;

    // ── Crear materiales para las 6 caras de un cubo ──
    // UV mapping para cada cara: [u1,v1, u2,v2] en coordenadas 0-1 del atlas 64x64
    function makeFaceMaterials(texture, faceUVs, width64 = 64, height64 = 64) {
        return faceUVs.map(([u1, v1, u2, v2]) => {
            const mat = new THREE.MeshLambertMaterial({
                map: texture,
                transparent: true,
                alphaTest: 0.1
            });
            // Modificar UVs del geometry después — por ahora retornamos material
            mat.userData.uv = [u1 / width64, 1 - v2 / height64, u2 / width64, 1 - v1 / height64];
            return mat;
        });
    }

    // ── Crear caja con UV personalizado por cara ──
    // faceUVs: array de 6 entradas [right, left, top, bottom, front, back]
    // cada entrada: [sx, sy, sw, sh] en pixels del texture atlas 64x64
    function makeBox(w, h, d, faceUVs, texture, tx = 64, ty = 64) {
        const geo = new THREE.BoxGeometry(w, h, d);
        const uvAttr = geo.attributes.uv;

        // BoxGeometry genera 4 vertices por cara, 6 caras = 24 vertices
        // Orden de caras en BoxGeometry: +X (right), -X (left), +Y (top), -Y (bottom), +Z (front), -Z (back)
        for (let face = 0; face < 6; face++) {
            const [sx, sy, sw, sh] = faceUVs[face];
            const u0 = sx / tx, u1 = (sx + sw) / tx;
            const v0 = 1 - (sy + sh) / ty, v1 = 1 - sy / ty;

            const base = face * 4;
            // Asignar UVs a los 4 vértices de la cara
            uvAttr.setXY(base + 0, u0, v1);
            uvAttr.setXY(base + 1, u1, v1);
            uvAttr.setXY(base + 2, u0, v0);
            uvAttr.setXY(base + 3, u1, v0);
        }
        uvAttr.needsUpdate = true;

        const mat = new THREE.MeshLambertMaterial({ map: texture, transparent: true, alphaTest: 0.05 });
        return new THREE.Mesh(geo, mat);
    }

    function buildCharacter(texture) {
        // Limpiar personaje anterior
        while (character.children.length) {
            const child = character.children[0];
            if (child.geometry) child.geometry.dispose();
            character.remove(child);
        }

        // Escala: 1 unidad = 1 pixel de Minecraft (skin 8px = 1 bloque)
        const S = 1; // escala base

        // ── Cabeza (8x8x8 en la skin, posición [0,0] frente = [8,8]) ──
        // Caras: right[16,8,8,8], left[0,8,8,8], top[8,0,8,8], bottom[16,0,8,8], front[8,8,8,8], back[24,8,8,8]
        const head = makeBox(8*S, 8*S, 8*S, [
            [16, 8, 8, 8],  // right
            [0,  8, 8, 8],  // left
            [8,  0, 8, 8],  // top
            [16, 0, 8, 8],  // bottom
            [8,  8, 8, 8],  // front
            [24, 8, 8, 8],  // back
        ], texture);
        head.position.set(0, 10*S, 0);
        character.add(head);

        // ── Torso (8x12x4) ──
        // right[28,20,4,12] left[16,20,4,12] top[20,16,8,4] bottom[28,16,8,4] front[20,20,8,12] back[32,20,8,12]
        const torso = makeBox(8*S, 12*S, 4*S, [
            [28, 20, 4, 12],
            [16, 20, 4, 12],
            [20, 16, 8,  4],
            [28, 16, 8,  4],
            [20, 20, 8, 12],
            [32, 20, 8, 12],
        ], texture);
        torso.position.set(0, 0, 0);
        character.add(torso);

        // ── Brazo derecho (4x12x4) ──
        // right[48,20,4,12] left[40,20,4,12] top[44,16,4,4] bottom[48,16,4,4] front[44,20,4,12] back[52,20,4,12]
        const armR = makeBox(4*S, 12*S, 4*S, [
            [48, 20, 4, 12],
            [40, 20, 4, 12],
            [44, 16, 4,  4],
            [48, 16, 4,  4],
            [44, 20, 4, 12],
            [52, 20, 4, 12],
        ], texture);
        armR.position.set(-6*S, 0, 0);
        character.add(armR);

        // ── Brazo izquierdo (espejo o coords 1.8) ──
        const armL = makeBox(4*S, 12*S, 4*S, [
            [36, 52, 4, 12],
            [44, 52, 4, 12],
            [36, 48, 4,  4],
            [40, 48, 4,  4],
            [44, 52, 4, 12],
            [48, 52, 4, 12],
        ], texture);
        armL.position.set(6*S, 0, 0);
        character.add(armL);

        // ── Pierna derecha (4x12x4) ──
        // right[8,20,4,12] left[0,20,4,12] top[4,16,4,4] bottom[8,16,4,4] front[4,20,4,12] back[12,20,4,12]
        const legR = makeBox(4*S, 12*S, 4*S, [
            [8,  20, 4, 12],
            [0,  20, 4, 12],
            [4,  16, 4,  4],
            [8,  16, 4,  4],
            [4,  20, 4, 12],
            [12, 20, 4, 12],
        ], texture);
        legR.position.set(-2*S, -12*S, 0);
        character.add(legR);

        // ── Pierna izquierda ──
        const legL = makeBox(4*S, 12*S, 4*S, [
            [20, 52, 4, 12],
            [28, 52, 4, 12],
            [20, 48, 4,  4],
            [24, 48, 4,  4],
            [24, 52, 4, 12],
            [28, 52, 4, 12],
        ], texture);
        legL.position.set(2*S, -12*S, 0);
        character.add(legL);

        // Centrar personaje verticalmente
        character.position.set(0, 2*S, 0);
    }

    // ── Cargar skin desde ruta o URL ──
    function loadSkin(src) {
        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin('anonymous');
        loader.load(
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

    // ── Control de mouse para rotar ──
    let isDragging = false;
    let prevX = 0;
    canvas.addEventListener('mousedown', (e) => { isDragging = true; prevX = e.clientX; });
    canvas.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        rotY += (e.clientX - prevX) * 0.01;
        prevX = e.clientX;
    });
    canvas.addEventListener('mouseup', () => isDragging = false);
    canvas.addEventListener('mouseleave', () => isDragging = false);

    // ── Loop de animación ──
    let walkPhase = 0;
    function animate() {
        animFrame = requestAnimationFrame(animate);

        // Rotación automática suave si no se está arrastrando
        if (!isDragging) rotY += 0.008;

        character.rotation.y = rotY;

        // Animación de caminar
        walkPhase += 0.05;
        if (character.children.length >= 6) {
            const armR = character.children[2];
            const armL = character.children[3];
            const legR = character.children[4];
            const legL = character.children[5];
            const swing = Math.sin(walkPhase) * 0.4;
            if (armR) armR.rotation.x = swing;
            if (armL) armL.rotation.x = -swing;
            if (legR) legR.rotation.x = -swing;
            if (legL) legL.rotation.x = swing;
        }

        renderer.render(scene, camera);
    }
    animate();

    // ── API pública ──
    return {
        loadSkin,
        destroy() {
            cancelAnimationFrame(animFrame);
            renderer.dispose();
            canvas.remove();
        }
    };
}

module.exports = { createSkinViewer };