// skin3d.js — Visor 3D de skin de Minecraft usando Three.js puro
// Sin dependencias externas problemáticas, todo en un archivo

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

    // ── COSMÉTICOS 3D ──
    const cosmeticMeshes = {};
    const cosmeticTexLoader = new THREE.TextureLoader();
    cosmeticTexLoader.setCrossOrigin('anonymous');

    function loadCosmeticTexture(key, url) {
        if (cosmeticMeshes[key]) {
            scene.remove(cosmeticMeshes[key]);
            if (cosmeticMeshes[key].geometry) cosmeticMeshes[key].geometry.dispose();
            if (cosmeticMeshes[key].material) cosmeticMeshes[key].material.dispose();
            delete cosmeticMeshes[key];
        }
        if (!url) return;
        cosmeticTexLoader.load(url, (tex) => {
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.05 });
            let mesh;
            switch (key) {
                case 'cape': {
                    const geo = new THREE.PlaneGeometry(8, 12);
                    mesh = new THREE.Mesh(geo, mat);
                    mesh.position.set(0, 0, -2.5);
                    break;
                }
                case 'hat': {
                    const geo = new THREE.BoxGeometry(8.5, 8.5, 8.5);
                    mesh = new THREE.Mesh(geo, mat);
                    mesh.position.set(0, 10, 0);
                    break;
                }
                case 'wings': {
                    const leftMat = mat.clone();
                    const leftGeo = new THREE.PlaneGeometry(10, 12);
                    const rightGeo = new THREE.PlaneGeometry(10, 12);
                    const leftWing = new THREE.Mesh(leftGeo, leftMat);
                    const rightWing = new THREE.Mesh(rightGeo, mat);
                    leftWing.position.set(-9, 2, 0);
                    rightWing.position.set(9, 2, 0);
                    leftWing.rotation.y = 0.3;
                    rightWing.rotation.y = -0.3;
                    const group = new THREE.Group();
                    group.add(leftWing, rightWing);
                    mesh = group;
                    break;
                }
            }
            if (mesh) {
                character.add(mesh);
                cosmeticMeshes[key] = mesh;
            }
        });
    }

    function setCosmeticTint(key, hexColor) {
        const mesh = cosmeticMeshes[key];
        if (!mesh) return;
        const color = new THREE.Color(hexColor);
        if (mesh.material) mesh.material.color = color;
        else mesh.traverse(child => { if (child.material) child.material.color = color; });
    }

    window.__setCosmeticTexture = loadCosmeticTexture;
    window.__setCosmeticTint = setCosmeticTint;

    return {
        loadSkin,
        loadCosmetic: loadCosmeticTexture,
        setCosmeticTint,
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

module.exports = { createSkinViewer };
