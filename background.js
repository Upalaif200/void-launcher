// [VOID-CLIENT ADDITION] Dynamic 3D background with hypercube/tesseract
const THREE = require('three');

(function initBackground() {
    const container = document.createElement('div');
    container.id = 'bg-container';
    container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;';
    document.body.prepend(container);

    const scene = new THREE.Scene();

    const hexToRgb = hex => {
        const v = parseInt(hex.replace('#',''), 16);
        return [(v>>16)&255, (v>>8)&255, v&255];
    };

    function buildBgTexture(colors, useGradient, direction, stops) {
        const c = document.createElement('canvas');
        const size = 512;
        c.width = size; c.height = size;
        const cx = c.getContext('2d');

        if (!useGradient || !colors.length) {
            cx.fillStyle = colors[0] || '#010005';
            cx.fillRect(0, 0, size, size);
            return new THREE.CanvasTexture(c);
        }

        const dirMap = {
            'to bottom':       [0, 0, 0, size],
            'to top':          [0, size, 0, 0],
            'to right':        [0, 0, size, 0],
            'to left':         [size, 0, 0, 0],
            'to bottom right': [0, 0, size, size],
            'to bottom left':  [size, 0, 0, size],
            'to top right':    [0, size, size, 0],
            'to top left':     [size, size, 0, 0]
        };
        const d = dirMap[direction] || [0, 0, 0, size];
        const g = cx.createLinearGradient(d[0], d[1], d[2], d[3]);

        const n = Math.min(stops || colors.length, colors.length);
        for (let i = 0; i < n; i++) {
            g.addColorStop(n === 1 ? 0 : i / (n - 1), colors[i]);
        }
        cx.fillStyle = g;
        cx.fillRect(0, 0, size, size);
        return new THREE.CanvasTexture(c);
    }
    scene.background = buildBgTexture(['#010005', '#050015', '#0a0030', '#150060', '#200080'], true, 'to bottom', 5);

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 6);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
    container.appendChild(renderer.domElement);

    const starCount = 1000;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i++) starPos[i] = (Math.random() - 0.5) * 200;
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
        color: 0xFFFFFF, size: 0.1, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending
    }));
    scene.add(stars);

    function createNebulaSprite(color, size, opacity, x, y, z) {
        const sCanvas = document.createElement('canvas');
        sCanvas.width = 128; sCanvas.height = 128;
        const sCtx = sCanvas.getContext('2d');
        const sGrad = sCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
        sGrad.addColorStop(0, `rgba(${(color>>16)&0xFF},${(color>>8)&0xFF},${color&0xFF},${opacity})`);
        sGrad.addColorStop(0.4, `rgba(${(color>>16)&0xFF},${(color>>8)&0xFF},${color&0xFF},${opacity*0.4})`);
        sGrad.addColorStop(1, 'rgba(0,0,0,0)');
        sCtx.fillStyle = sGrad;
        sCtx.fillRect(0, 0, 128, 128);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: new THREE.CanvasTexture(sCanvas), blending: THREE.AdditiveBlending,
            depthWrite: false, transparent: true
        }));
        sprite.position.set(x, y, z);
        sprite.scale.set(size, size, 1);
        return sprite;
    }

    const nebulaColors = [0x3a1580, 0x2a1060, 0x4a2090, 0x1a0050];
    for (let i = 0; i < 6; i++) {
        scene.add(createNebulaSprite(
            nebulaColors[i % nebulaColors.length],
            8 + Math.random() * 12,
            0.04 + Math.random() * 0.06,
            (Math.random() - 0.5) * 30,
            (Math.random() - 0.5) * 20,
            -5 - Math.random() * 15
        ));
    }

    const tesseractData = (() => {
        const v = [];
        for (let i = 0; i < 16; i++) v.push([(i&1)?1:-1, (i&2)?1:-1, (i&4)?1:-1, (i&8)?1:-1]);
        const e = [];
        for (let i = 0; i < 16; i++)
            for (let j = i + 1; j < 16; j++) {
                const d = i ^ j;
                if (d === 1 || d === 2 || d === 4 || d === 8) e.push([i, j]);
            }
        return { vertices4D: v, edges: e };
    })();
    let angleXY = 0, angleZW = 0, angleXW = 0;

    function projectVertices() {
        const cosXY = Math.cos(angleXY), sinXY = Math.sin(angleXY);
        const cosZW = Math.cos(angleZW), sinZW = Math.sin(angleZW);
        const cosXW = Math.cos(angleXW), sinXW = Math.sin(angleXW);
        const dist = 2.5;
        const out = [];
        for (let n = 0; n < 16; n++) {
            let [x, y, z, w] = tesseractData.vertices4D[n];
            let nx = x * cosXY - y * sinXY;
            let ny = x * sinXY + y * cosXY;
            x = nx; y = ny;
            let nz = z * cosZW - w * sinZW;
            let nw = z * sinZW + w * cosZW;
            z = nz; w = nw;
            nx = x * cosXW - w * sinXW;
            nw = x * sinXW + w * cosXW;
            x = nx; w = nw;
            const s = dist / (dist + w * 0.5);
            out.push([x * s, y * s, z * s]);
        }
        return out;
    }

    const edgePositions = new Float32Array(tesseractData.edges.length * 6);
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute('position', new THREE.BufferAttribute(edgePositions, 3));
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x8B5CF6, transparent: true, opacity: 0.18 });
    scene.add(new THREE.LineSegments(edgeGeo, edgeMat));

    const vertPositions = new Float32Array(16 * 3);
    const vertGeo = new THREE.BufferGeometry();
    vertGeo.setAttribute('position', new THREE.BufferAttribute(vertPositions, 3));
    const vertMat = new THREE.PointsMaterial({ color: 0xA855F7, size: 0.25, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending });
    scene.add(new THREE.Points(vertGeo, vertMat));

    const glowCount = 16;
    const glowPositions = new Float32Array(glowCount * 3);
    const glowColors = new Float32Array(glowCount * 3);
    for (let i = 0; i < glowCount; i++) {
        glowColors[i*3] = 0.40; glowColors[i*3+1] = 0.15; glowColors[i*3+2] = 0.70;
    }
    const glowGeo = new THREE.BufferGeometry();
    glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPositions, 3));
    glowGeo.setAttribute('color', new THREE.BufferAttribute(glowColors, 3));
    const glowMat = new THREE.PointsMaterial({ size: 0.1, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, vertexColors: true });
    const glowPoints = new THREE.Points(glowGeo, glowMat);
    scene.add(glowPoints);

    let frameCount = 0;

    function updateTesseract() {
        frameCount++;
        const projected = projectVertices();
        const eArr = edgeGeo.attributes.position.array;
        let idx = 0;
        for (const [i, j] of tesseractData.edges) {
            const v1 = projected[i], v2 = projected[j];
            eArr[idx*6] = v1[0]; eArr[idx*6+1] = v1[1]; eArr[idx*6+2] = v1[2];
            eArr[idx*6+3] = v2[0]; eArr[idx*6+4] = v2[1]; eArr[idx*6+5] = v2[2];
            idx++;
        }
        edgeGeo.attributes.position.needsUpdate = true;

        const vArr = vertGeo.attributes.position.array;
        for (let i = 0; i < 16; i++) {
            vArr[i*3] = projected[i][0]; vArr[i*3+1] = projected[i][1]; vArr[i*3+2] = projected[i][2];
        }
        vertGeo.attributes.position.needsUpdate = true;

        // Update glow particles every 6th frame
        if (frameCount % 6 === 0) {
            const gArr = glowPoints.geometry.attributes.position.array;
            for (let i = 0; i < glowCount; i++) {
                const vi = Math.floor(Math.random() * 16);
                const v = projected[vi];
                const offset = 0.05 + Math.random() * 0.15;
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.random() * Math.PI * 2;
                gArr[i*3] = v[0] + Math.sin(theta) * Math.cos(phi) * offset;
                gArr[i*3+1] = v[1] + Math.sin(theta) * Math.sin(phi) * offset;
                gArr[i*3+2] = v[2] + Math.cos(theta) * offset;
            }
            glowPoints.geometry.attributes.position.needsUpdate = true;
        }
    }

    let hidden = false;
    let animId = null;
    document.addEventListener('visibilitychange', () => {
        hidden = document.hidden;
        if (hidden && animId !== null) { cancelAnimationFrame(animId); animId = null; }
        else if (!hidden) animate();
    });

    function animate() {
        if (hidden) return;
        animId = requestAnimationFrame(animate);

        angleXY += 0.003; angleZW += 0.005; angleXW += 0.002;

        updateTesseract();

        stars.rotation.y += 0.0001;
        stars.rotation.x += 0.00005;

        renderer.render(scene, camera);
    }

    animate();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    window.__updateBgTheme = function(colors) {
        const bg = colors.background;
        if (scene.background) scene.background.dispose();
        scene.background = buildBgTexture(
            bg?.colors || ['#010005'],
            bg?.useGradient !== false,
            bg?.gradientDirection || 'to bottom',
            bg?.gradientStops || 2
        );

        const animColor = bg?.animationColor || '#8844ee';
        const [r8, g8, b8] = hexToRgb(animColor);
        const r = r8 / 255, g = g8 / 255, b = b8 / 255;

        edgeMat.color.setRGB(r, g, b);
        edgeMat.opacity = 0.25;

        vertMat.color.setRGB(r * 0.8, g * 0.7, b);
        vertMat.opacity = 0.9;

        const gc = glowPoints.geometry.attributes.color;
        for (let i = 0; i < gc.count; i++) {
            gc.array[i*3] = r * (0.5 + Math.random() * 0.5);
            gc.array[i*3+1] = g * (0.3 + Math.random() * 0.4);
            gc.array[i*3+2] = b * (0.7 + Math.random() * 0.3);
        }
        gc.needsUpdate = true;
    };
})();
