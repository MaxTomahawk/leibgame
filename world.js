import * as THREE from 'three';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/DRACOLoader.js';
import { SkeletonUtils } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/utils/SkeletonUtils.js';
import { doc, getDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

let worldUnsubscribe = null;

// --- GLOBAL ASSET CONFIGURATION ---
const ASSET_CONFIG = {
    COIN_SCALE: 0.5,
    COIN_ROTATION_SPEED: 2.0,
    ENEMY_SCALE: 1.4,
    ENEMY_COLLISION_DISTANCE: 0.3,
};
export { ASSET_CONFIG };

// --- ASSET LOADING ---
let cachedCoinScene = null;
let cachedEnemyGLTF = null;

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

// Load Coin GLB
gltfLoader.load('assets/coin.glb', (gltf) => {
    cachedCoinScene = gltf.scene;
    cachedCoinScene.scale.set(ASSET_CONFIG.COIN_SCALE, ASSET_CONFIG.COIN_SCALE, ASSET_CONFIG.COIN_SCALE);
    cachedCoinScene.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
        }
    });
    console.log("🪙 Coin model loaded successfully!");
}, undefined, (err) => {
    console.warn("Could not load coin.glb, using fallback cylinder.", err);
});

// Load Enemy GLB
gltfLoader.load('assets/enemy.glb', (gltf) => {
    cachedEnemyGLTF = gltf;
    cachedEnemyGLTF.scene.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
        }
    });
    console.log("😈 Enemy model loaded successfully!");
}, undefined, (err) => {
    console.warn("Could not load enemy.glb, using fallback placeholder.", err);
});


// --- WORLD SYNC LOGIC ---
export async function syncAndBuildWorld(scene, ui, platforms, coins, enemies, projectiles, isMultiplayer, db, CASTLE_Z, platformTexture, textureLoader) {
    ui.status.innerText = "Loading world...";

    // Clean up existing objects
    platforms.forEach(p => {
        scene.remove(p);
        if (p.geometry) p.geometry.dispose();
        if (p.material && !p.material.userData.isShared) p.material.dispose();
    });
    platforms.length = 0;

    coins.forEach(c => scene.remove(c)); coins.length = 0;

    enemies.forEach(e => {
        scene.remove(e);
        if (e.userData.mixer) e.userData.mixer = null;
    });
    enemies.length = 0;

    projectiles.forEach(p => scene.remove(p.mesh)); projectiles.length = 0;

    let worldData = null;

    if (isMultiplayer) {
        try {
            const worldDocRef = doc(db, "levels", "main_world");

            const cachedWorld = localStorage.getItem('cachedWorld');
            if (cachedWorld) {
                try {
                    const cached = JSON.parse(cachedWorld);
                    console.log("📦 Using cached world data (no read needed)");
                    worldData = cached;
                } catch (e) {
                    console.warn("Failed to parse cached world, fetching from Firebase");
                }
            }

            if (!worldData) {
                const docSnap = await getDoc(worldDocRef);

                if (docSnap.exists()) {
                    console.log("☁️ Fetched world from Firebase (1 read)");
                    worldData = docSnap.data();
                    localStorage.setItem('cachedWorld', JSON.stringify(worldData));
                } else {
                    console.log("No world found, generating new one...");
                    worldData = generateWorldData(CASTLE_Z);
                    await setDoc(worldDocRef, worldData);
                    localStorage.setItem('cachedWorld', JSON.stringify(worldData));
                }
            }

            if (!worldUnsubscribe) {
                worldUnsubscribe = setupWorldListener(worldDocRef, scene, CASTLE_Z, platforms, coins, enemies, platformTexture, textureLoader);
            }

        } catch (e) {
            console.error("Error fetching world (likely permissions):", e);
            ui.status.innerHTML = "⚠️ <strong>Database Error:</strong> Access denied.<br><small>Check your Firestore Rules in the Console.</small>";
            ui.status.className = "bg-red-100 text-red-800 p-3 rounded mb-4 border border-red-400";
            worldData = generateWorldData(CASTLE_Z);
        }
    } else {
        worldData = generateWorldData(CASTLE_Z);
    }

    if (!worldData || !worldData.platforms || worldData.platforms.length === 0) {
        console.warn("Received world data was empty, fallback to local generation.");
        worldData = generateWorldData(CASTLE_Z);
    }

    buildWorldFromData(worldData, scene, CASTLE_Z, platforms, coins, enemies, platformTexture, textureLoader);

    if (!ui.status.innerText.includes("Error")) {
        ui.status.innerText = "Have fun!";
    }
}

// World listener setup
function setupWorldListener(worldDocRef, scene, CASTLE_Z, platforms, coins, enemies, platformTexture, textureLoader) {
    let lastWorldTimestamp = null;

    const unsubscribe = onSnapshot(worldDocRef, (docSnap) => {
        if (!docSnap.exists()) return;

        const data = docSnap.data();
        const currentTimestamp = data.generatedAt || 0;

        if (lastWorldTimestamp === null) {
            lastWorldTimestamp = currentTimestamp;
            return;
        }

        if (currentTimestamp !== lastWorldTimestamp) {
            console.log("🌍 World regenerated! Reloading...");
            lastWorldTimestamp = currentTimestamp;

            localStorage.setItem('cachedWorld', JSON.stringify(data));

            platforms.forEach(p => {
                scene.remove(p);
                if (p.geometry) p.geometry.dispose();
                if (p.material && !p.material.userData.isShared) p.material.dispose();
            });
            platforms.length = 0;

            coins.forEach(c => scene.remove(c));
            coins.length = 0;

            enemies.forEach(e => {
                scene.remove(e);
                if (e.userData.mixer) e.userData.mixer = null;
            });
            enemies.length = 0;

            buildWorldFromData(data, scene, CASTLE_Z, platforms, coins, enemies, platformTexture, textureLoader);

            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0, 255, 0, 0.9);
                color: white;
                padding: 20px 40px;
                border-radius: 10px;
                font-size: 24px;
                font-weight: bold;
                z-index: 10000;
                animation: fadeOut 3s forwards;
            `;
            notification.innerText = "🌍 New world loaded!";
            document.body.appendChild(notification);

            setTimeout(() => notification.remove(), 3000);
        }
    });

    return unsubscribe;
}

// --- WORLD DATA GENERATOR ---
export function generateWorldData(CASTLE_Z) {
    const data = {
        platforms: [],
        coins: [],
        enemies: [],
        generatedAt: Date.now()
    };

    // Start platform
    data.platforms.push({ x: 0, y: -2, z: 0, w: 10, h: 2, d: 10 });

    let z = -10;
    while (z > CASTLE_Z + 20) {
        let x = (Math.random() - 0.5) * 30;
        let y = (Math.random() - 0.5) * 6;
        let w = 4 + Math.random() * 4;
        let h = 2 + Math.random() * 2;
        let d = 4 + Math.random() * 4;

        data.platforms.push({ x, y, z, w, h, d });

        if (Math.random() > 0.4) data.coins.push({ x, y: y + 3, z });
        if (Math.random() > 0.7) data.enemies.push({ x, y: y + 3, z });
        z -= (5 + Math.random() * 4);
    }
    // End platform (at castle)
    data.platforms.push({ x: 0, y: 0, z: CASTLE_Z, w: 20, h: 2, d: 20 });

    return data;
}

// --- HELPER: TEXT TEXTURE GENERATOR ---
function createTextTexture(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Transparent background
    ctx.fillStyle = 'rgba(0, 0, 0, 0)'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Text style
    ctx.font = 'bold 120px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Text outline
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'black';
    ctx.strokeText(text, canvas.width / 2, canvas.height / 2);

    // Text color (Gold/Orange gradient)
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, "#FFD700");
    gradient.addColorStop(1, "#FF8C00");
    ctx.fillStyle = gradient;
    
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter; 
    return texture;
}

// --- BIRTHDAY CAKE BUILDER (Replaces Castle) ---
function createCastle(scene, CASTLE_Z) {
    console.log("creating colorful birthday cake with candles...")
    const cake = new THREE.Group();

    // Materials (Festive colors!)
    const matBottom = new THREE.MeshStandardMaterial({ color: 0xD2691E }); // Chocolate
    const matMid = new THREE.MeshStandardMaterial({ color: 0xFF69B4 }); // Pink
    const matTop = new THREE.MeshStandardMaterial({ color: 0xFFFACD }); // Lemon Cream
    
    // === TIER 1 (Base - Chocolate) ===
    const tier1 = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 4, 32), matBottom);
    tier1.position.y = 2;
    tier1.castShadow = true;
    tier1.receiveShadow = true;
    cake.add(tier1);

    // === TIER 2 (Middle - Pink) ===
    const tier2 = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 4, 32), matMid);
    tier2.position.y = 6;
    tier2.castShadow = true;
    tier2.receiveShadow = true;
    cake.add(tier2);

    // === TIER 3 (Top - Lemon) ===
    const tier3 = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 4, 32), matTop);
    tier3.position.y = 10;
    tier3.castShadow = true;
    tier3.receiveShadow = true;
    cake.add(tier3);

    // === CANDLES ===
    const candleGeo = new THREE.CylinderGeometry(0.3, 0.3, 2, 12);
    const flameGeo = new THREE.ConeGeometry(0.25, 0.8, 12);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xFF4500 }); // Orange glow
    
    // Place 5 candles in a circle on the top layer
    const numCandles = 5;
    const radius = 2.5;
    
    for(let i = 0; i < numCandles; i++) {
        const angle = (i / numCandles) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        
        // Candle body (random color)
        const candleColor = new THREE.Color().setHSL(Math.random(), 1.0, 0.5);
        const candle = new THREE.Mesh(candleGeo, new THREE.MeshStandardMaterial({ color: candleColor }));
        candle.position.set(x, 13, z); // 10 (top) + 2 (half height) + 1 (on top)
        
        // Flame
        const flame = new THREE.Mesh(flameGeo, flameMat);
        flame.position.set(0, 1.4, 0); // Top of candle
        candle.add(flame);

        // Optional: Point light for each flame
        const light = new THREE.PointLight(0xFFA500, 1, 5);
        light.position.set(0, 1.5, 0);
        candle.add(light);

        cake.add(candle);
    }
    
    // === BILLBOARD TEXT: "GEFELICITEERD LUUK" ===
    const textGeo = new THREE.PlaneGeometry(15, 5);
    const textTexture = createTextTexture("GEFELICITEERD LUUK");
    
    const textMat = new THREE.MeshBasicMaterial({ 
        map: textTexture, 
        transparent: true, 
        side: THREE.DoubleSide,
        depthTest: false // Ensures text is always visible
    });
    
    const textBillboard = new THREE.Mesh(textGeo, textMat);
    // Place higher: y = 22
    textBillboard.position.set(0, 22, 0); 
    
    textBillboard.userData.isBillboard = true;
    textBillboard.name = 'TaartBillboard';
    textBillboard.renderOrder = 999; 
    
    cake.add(textBillboard);

    // === FINAL POSITION ===
    cake.position.set(0, 1, CASTLE_Z);
    scene.add(cake);
    
    return cake;
}

// --- BUILD WORLD ---
export function buildWorldFromData(data, scene, CASTLE_Z, platforms, coins, enemies, platformTexture, textureLoader) {

    const sharedCloudMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.9,
        metalness: 0.1,
        flatShading: true
    });
    sharedCloudMaterial.userData.isShared = true;

    if (data.platforms) {
        data.platforms.forEach(p => {
            createPlat(p.x, p.y, p.z, p.w, p.h, p.d, scene, platforms, sharedCloudMaterial);
        });
    }

    scene.updateMatrixWorld(true);

    if (data.coins && data.coins.length > 0) {
        data.coins.forEach(c => createCoin(c.x, c.y, c.z, scene, coins));
    }

    if (data.enemies) {
        data.enemies.forEach(e => createEnemy(e.x, e.y, e.z, scene, enemies, platforms));
    }

    // STORE CAKE IN GLOBAL VARIABLE
    window.castle = createCastle(scene, CASTLE_Z);
}

// --- ROUND CLOUD GENERATION ---
function createPlat(x, y, z, w, h, d, scene, platforms, material) {
    const useMat = material || new THREE.MeshStandardMaterial({ color: 0xffffff });

    const baseRadius = Math.min(w, d) * 0.4;

    const mainGeo = new THREE.IcosahedronGeometry(baseRadius, 0);
    const mainMesh = new THREE.Mesh(mainGeo, useMat);

    mainMesh.scale.set(w / baseRadius * 0.5, h / baseRadius * 0.5, d / baseRadius * 0.5);
    mainMesh.position.set(x, y, z);

    mainMesh.castShadow = true;
    mainMesh.receiveShadow = true;
    mainMesh.userData.isPlatform = true;

    scene.add(mainMesh);
    platforms.push(mainMesh);

    const puffCount = 4 + Math.floor(Math.random() * 4);

    for (let i = 0; i < puffCount; i++) {
        const puffRadius = baseRadius * (0.6 + Math.random() * 0.5);
        const puffGeo = new THREE.IcosahedronGeometry(puffRadius, 0);
        const puffMesh = new THREE.Mesh(puffGeo, useMat);

        puffMesh.position.set(
            x + (Math.random() - 0.5) * w * 0.8,
            y + (Math.random() - 0.5) * h * 0.5,
            z + (Math.random() - 0.5) * d * 0.8
        );

        puffMesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

        puffMesh.castShadow = true;
        puffMesh.receiveShadow = true;
        puffMesh.userData.isPlatform = true;

        scene.add(puffMesh);
        platforms.push(puffMesh);
    }
}

function createCoin(x, y, z, scene, coins) {
    const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 0.1),
        new THREE.MeshPhongMaterial({ color: 0xffd700 })
    );
    mesh.position.set(x, y, z);
    mesh.rotation.x = Math.PI / 2;
    console.log("created coin at: ", x, y, z)
    scene.add(mesh);
    coins.push(mesh);
}

// --- Star GENERATION ---
function createStar(x, y, z, scene, coins) {
    let mesh;

    if (cachedCoinScene) {
        mesh = cachedCoinScene.clone();
        mesh.position.set(x, y, z);
        mesh.userData.isStar = true;

    } else {
        mesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.5 * ASSET_CONFIG.COIN_SCALE, 0.5 * ASSET_CONFIG.COIN_SCALE, 0.1 * ASSET_CONFIG.COIN_SCALE, 12),
            new THREE.MeshPhongMaterial({ color: 0xffd700 })
        );
        mesh.position.set(x, y, z);
        mesh.rotation.x = Math.PI / 2;
        mesh.userData.isStar = true;
    }

    mesh.castShadow = true;
    scene.add(mesh);
    coins.push(mesh);
}

// Export function to spawn coin at enemy position
export function spawnStarAtPosition(x, y, z, scene, coins) {
    createStar(x, y, z, scene, coins);
    console.log(`🪙 Coin spawned at (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`);
}

// --- ENEMY GENERATION ---
function createEnemy(x, y, z, scene, enemies, platforms) {
    let mesh;

    if (cachedEnemyGLTF) {
        mesh = SkeletonUtils.clone(cachedEnemyGLTF.scene);
        mesh.scale.set(ASSET_CONFIG.ENEMY_SCALE, ASSET_CONFIG.ENEMY_SCALE, ASSET_CONFIG.ENEMY_SCALE);

        if (cachedEnemyGLTF.animations && cachedEnemyGLTF.animations.length > 0) {
            const mixer = new THREE.AnimationMixer(mesh);
            const action = mixer.clipAction(cachedEnemyGLTF.animations[0]);
            action.play();
            mesh.userData.mixer = mixer;
        }

    } else {
        const geo = new THREE.BoxGeometry(1, 1, 1);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
        mesh = new THREE.Mesh(geo, mat);
        mesh.userData.isPlaceholder = true;
    }

    mesh.position.set(x, y, z);

    const raycaster = new THREE.Raycaster();
    const rayOrigin = new THREE.Vector3(x, y + 10, z);
    const rayDirection = new THREE.Vector3(0, -1, 0);
    raycaster.set(rayOrigin, rayDirection);

    const intersects = raycaster.intersectObjects(platforms, true);

    if (intersects.length > 0) {
        const groundY = intersects[0].point.y;
        mesh.position.y = groundY;
    }

    scene.add(mesh);
    enemies.push(mesh);
}

// Cleanup function
export function cleanupWorldListener() {
    if (worldUnsubscribe) {
        worldUnsubscribe();
        worldUnsubscribe = null;
        console.log("🛑 World listener stopped");
    }
                 }
