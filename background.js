// [VOID-CLIENT ADDITION] Dynamic 3D background with hypercube/tesseract
const THREE = require('three');

(function initBackground() {
    const container = document.createElement('div');
    container.id = 'bg-container';
    container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;';
    document.body.prepend(container);

    const scene = new THREE.Scene();

    // Gradient sky colors
    const colors = ['#030526', '#230740', '#6B3073', '#6568A6', '#F2D5E0'];
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.0, colors[0]);
    grad.addColorStop(0.3, colors[1]);
    grad.addColorStop(0.5, colors[2]);
    grad.addColorStop(0.7, colors[3]);
    grad.addColorStop(1.0, colors[4]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1, 512);
    const tex = new THREE.CanvasTexture(canvas);
    scene.background = tex;

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 6);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // ── Starfield ──
    const starGeo = new THREE.BufferGeometry();
    const starCount = 2000;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i++) {
        starPos[i] = (Math.random() - 0.5) * 200;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
        color: 0xFFFFFF,
        size: 0.15,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // ── Nebula clouds (billboard sprites) ──
    function createNebulaSprite(color, size, opacity, x, y, z) {
        const sCanvas = document.createElement('canvas');
        sCanvas.width = 128;
        sCanvas.height = 128;
        const sCtx = sCanvas.getContext('2d');
        const sGrad = sCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
        sGrad.addColorStop(0, `rgba(${(color>>16)&0xFF}, ${(color>>8)&0xFF}, ${color&0xFF}, ${opacity})`);
        sGrad.addColorStop(0.4, `rgba(${(color>>16)&0xFF}, ${(color>>8)&0xFF}, ${color&0xFF}, ${opacity*0.4})`);
        sGrad.addColorStop(1, 'rgba(0,0,0,0)');
        sCtx.fillStyle = sGrad;
        sCtx.fillRect(0, 0, 128, 128);
        const sTex = new THREE.CanvasTexture(sCanvas);
        const mat = new THREE.SpriteMaterial({
            map: sTex,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            transparent: true
        });
        const sprite = new THREE.Sprite(mat);
        sprite.position.set(x, y, z);
        sprite.scale.set(size, size, 1);
        return sprite;
    }

    const nebulaColors = [0x6B3073, 0x6568A6, 0x8B5CF6, 0xF2D5E0];
    for (let i = 0; i < 8; i++) {
        const color = nebulaColors[i % nebulaColors.length];
        const size = 8 + Math.random() * 12;
        const x = (Math.random() - 0.5) * 30;
        const y = (Math.random() - 0.5) * 20;
        const z = -5 - Math.random() * 15;
        const opacity = 0.08 + Math.random() * 0.12;
        scene.add(createNebulaSprite(color, size, opacity, x, y, z));
    }

    // ── Tesseract (4D hypercube) ──
    function buildTesseract() {
        const vertices4D = [];
        for (let i = 0; i < 16; i++) {
            vertices4D.push([
                (i & 1) ? 1 : -1,
                (i & 2) ? 1 : -1,
                (i & 4) ? 1 : -1,
                (i & 8) ? 1 : -1
            ]);
        }

        const edges = [];
        for (let i = 0; i < 16; i++) {
            for (let j = i + 1; j < 16; j++) {
                const diff = (i ^ j);
                if (diff === 1 || diff === 2 || diff === 4 || diff === 8) {
                    edges.push([i, j]);
                }
            }
        }

        return { vertices4D, edges };
    }

    const tesseractData = buildTesseract();

    // Rotation angles for 4D
    let angleXY = 0, angleZW = 0, angleXW = 0;

    function project4DTo3D(v4) {
        let [x, y, z, w] = v4;

        // Rotate in XY plane
        const cosXY = Math.cos(angleXY), sinXY = Math.sin(angleXY);
        const nx = x * cosXY - y * sinXY;
        const ny = x * sinXY + y * cosXY;
        x = nx; y = ny;

        // Rotate in ZW plane
        const cosZW = Math.cos(angleZW), sinZW = Math.sin(angleZW);
        const nz = z * cosZW - w * sinZW;
        const nw = z * sinZW + w * cosZW;
        z = nz; w = nw;

        // Rotate in XW plane
        const cosXW = Math.cos(angleXW), sinXW = Math.sin(angleXW);
        const nxw = x * cosXW - w * sinXW;
        const nww = x * sinXW + w * cosXW;
        x = nxw; w = nww;

        // Perspective projection 4D -> 3D
        const dist = 2.5;
        const scale = dist / (dist + w * 0.5);
        return [x * scale, y * scale, z * scale];
    }

    // Tesseract edge geometry (main)
    const edgePositions = [];
    for (const [i, j] of tesseractData.edges) {
        edgePositions.push(0, 0, 0, 0, 0, 0);
    }
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(edgePositions), 3));
    const edgeMat = new THREE.LineBasicMaterial({
        color: 0x8B5CF6,
        transparent: true,
        opacity: 0.35
    });
    const tesseractLines = new THREE.LineSegments(edgeGeo, edgeMat);
    scene.add(tesseractLines);

    // Glowing vertices
    const vertPositions = new Float32Array(16 * 3);
    const vertGeo = new THREE.BufferGeometry();
    vertGeo.setAttribute('position', new THREE.BufferAttribute(vertPositions, 3));
    const vertMat = new THREE.PointsMaterial({
        color: 0xA855F7,
        size: 0.12,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending
    });
    const tesseractVerts = new THREE.Points(vertGeo, vertMat);
    scene.add(tesseractVerts);

    // Glow particles around vertices
    const glowCount = 64;
    const glowPositions = new Float32Array(glowCount * 3);
    const glowColors = new Float32Array(glowCount * 3);
    for (let i = 0; i < glowCount; i++) {
        glowColors[i * 3] = 0.66;
        glowColors[i * 3 + 1] = 0.33;
        glowColors[i * 3 + 2] = 0.97;
    }
    const glowGeo = new THREE.BufferGeometry();
    glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPositions, 3));
    glowGeo.setAttribute('color', new THREE.BufferAttribute(glowColors, 3));
    const glowMat = new THREE.PointsMaterial({
        size: 0.06,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        vertexColors: true
    });
    const glowPoints = new THREE.Points(glowGeo, glowMat);
    scene.add(glowPoints);

    function updateTesseract() {
        const posAttr = tesseractLines.geometry.attributes.position;
        const array = posAttr.array;
        let idx = 0;
        for (const [i, j] of tesseractData.edges) {
            const v1 = project4DTo3D(tesseractData.vertices4D[i]);
            const v2 = project4DTo3D(tesseractData.vertices4D[j]);
            array[idx * 6] = v1[0];
            array[idx * 6 + 1] = v1[1];
            array[idx * 6 + 2] = v1[2];
            array[idx * 6 + 3] = v2[0];
            array[idx * 6 + 4] = v2[1];
            array[idx * 6 + 5] = v2[2];
            idx++;
        }
        posAttr.needsUpdate = true;

        const vPosAttr = tesseractVerts.geometry.attributes.position;
        const vArray = vPosAttr.array;
        for (let i = 0; i < 16; i++) {
            const v = project4DTo3D(tesseractData.vertices4D[i]);
            vArray[i * 3] = v[0];
            vArray[i * 3 + 1] = v[1];
            vArray[i * 3 + 2] = v[2];
        }
        vPosAttr.needsUpdate = true;

        // Update glow particles around random vertices
        const gPosAttr = glowPoints.geometry.attributes.position;
        const gArray = gPosAttr.array;
        for (let i = 0; i < glowCount; i++) {
            const vi = Math.floor(Math.random() * 16);
            const v = project4DTo3D(tesseractData.vertices4D[vi]);
            const offset = 0.05 + Math.random() * 0.15;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI * 2;
            gArray[i * 3] = v[0] + Math.sin(theta) * Math.cos(phi) * offset;
            gArray[i * 3 + 1] = v[1] + Math.sin(theta) * Math.sin(phi) * offset;
            gArray[i * 3 + 2] = v[2] + Math.cos(theta) * offset;
        }
        gPosAttr.needsUpdate = true;
    }

    // ── Animation loop ──
    function animate() {
        requestAnimationFrame(animate);

        angleXY += 0.003;
        angleZW += 0.005;
        angleXW += 0.002;

        updateTesseract();

        stars.rotation.y += 0.0001;
        stars.rotation.x += 0.00005;

        renderer.render(scene, camera);
    }

    animate();

    // ── Resize handler ──
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
})();
