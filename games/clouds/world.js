import * as THREE from 'three';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/DRACOLoader.js';
import { SkeletonUtils } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/utils/SkeletonUtils.js';
import { assetRegistry } from '../../shared/asset-registry.js';

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

export async function preloadWorldAssets() {
    await assetRegistry.load();
    const suffix = assetRegistry.getWorldQualitySuffix();
    console.log('🌍 World loading assets with quality:', suffix);

    const coinUrl = assetRegistry.getModelUrl('coin', assetRegistry.getGraphicsQuality() === 'low' ? 'low' : 'high');
    const enemyUrl = assetRegistry.getModelUrl('enemy', assetRegistry.getGraphicsQuality() === 'low' ? 'low' : 'high');

    gltfLoader.load(coinUrl, (gltf) => {
        cachedCoinScene = gltf.scene;
        cachedCoinScene.scale.set(ASSET_CONFIG.COIN_SCALE, ASSET_CONFIG.COIN_SCALE, ASSET_CONFIG.COIN_SCALE);
        cachedCoinScene.traverse((child) => {
            if (child.isMesh) child.castShadow = true;
        });
        console.log('🪙 Coin model loaded successfully!');
    }, undefined, (err) => console.warn('Could not load coin model, using fallback.', err));

    gltfLoader.load(enemyUrl, (gltf) => {
        cachedEnemyGLTF = gltf;
        cachedEnemyGLTF.scene.traverse((child) => {
            if (child.isMesh) child.castShadow = true;
        });
        console.log('😈 Enemy model loaded successfully!');
    }, undefined, (err) => console.warn('Could not load enemy model, using fallback.', err));
}


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

    // ===== ONLY USE FIREBASE IF MULTIPLAYER IS ENABLED AND DB EXISTS =====
    if (isMultiplayer && db) {
        try {
            // Dynamic import of Firestore functions
            const { doc, getDoc, setDoc } = await import("https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js");

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
                worldUnsubscribe = await setupWorldListener(worldDocRef, scene, CASTLE_Z, platforms, coins, enemies, platformTexture, textureLoader);
            }

        } catch (e) {
            console.error("Error fetching world:", e);
            ui.status.innerHTML = "⚠️ <strong>Database Error:</strong> Falling back to offline mode.";
            ui.status.className = "bg-yellow-100 text-yellow-800 p-3 rounded mb-4 border border-yellow-400";
            worldData = generateWorldData(CASTLE_Z);
        }
    } else {
        // Offline mode - just generate locally
        console.log("🎮 Generating offline world");
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

async function setupWorldListener(worldDocRef, scene, CASTLE_Z, platforms, coins, enemies, platformTexture, textureLoader) {
    let lastWorldTimestamp = null;

    // Dynamic import
    const { onSnapshot } = await import("https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js");

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
    data.platforms.push({ x: 0, y: -2, z: 2.5, w: 10, h: 2, d: 15 });

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

// --- LOW POLY CASTLE BUILDER ---
function createCastle(scene, CASTLE_Z) {
    // console.log("creating castle") // enable to see when castle is created..
    const castle = new THREE.Group();

    // === MAIN KEEP ===
    const keep = new THREE.Mesh(
        new THREE.BoxGeometry(10, 12, 10),
        new THREE.MeshStandardMaterial({ color: 0xbababa })
    );
    keep.position.y = 6;
    castle.add(keep);

    // === CORNER TOWERS ===
    const towerGeo = new THREE.CylinderGeometry(2, 2, 14, 6);
    const towerMat = new THREE.MeshStandardMaterial({ color: 0x999999 });

    const towerOffsets = [
        [5, 5],
        [-5, 5],
        [5, -5],
        [-5, -5]
    ];

    towerOffsets.forEach(([x, z]) => {
        const t = new THREE.Mesh(towerGeo, towerMat);
        t.position.set(x, 7, z);
        castle.add(t);

        const roof = new THREE.Mesh(
            new THREE.ConeGeometry(3, 3, 6),
            new THREE.MeshStandardMaterial({ color: 0x663300 })
        );
        roof.position.set(x, 15, z);
        castle.add(roof);
    });

    // === WALLS ===
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });

    const walls = [
        { x: 0, z: 7, w: 14, h: 6, d: 1 },
        { x: 0, z: -7, w: 14, h: 6, d: 1 },
        { x: 7, z: 0, w: 1, h: 6, d: 14 },
        { x: -7, z: 0, w: 1, h: 6, d: 14 }
    ];

    walls.forEach(w => {
        const wall = new THREE.Mesh(
            new THREE.BoxGeometry(w.w, w.h, w.d),
            wallMat
        );
        wall.position.set(w.x, w.h / 2, w.z);
        castle.add(wall);

    });

    // === FINAL POSITION ===
    castle.position.set(0, 1, CASTLE_Z);
    scene.add(castle);
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

    createCastle(scene, CASTLE_Z);
    createRonnieStall(scene, { x: 0, y: 1.2, z: 5, rotation: Math.PI}); 
    const sky = createCloudySky();
    scene.add(sky);
}

function createCoin(x, y, z, scene, coins) {
    const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 0.1),
        new THREE.MeshPhongMaterial({ color: 0xffd700 })
    );
    mesh.position.set(x, y, z);
    mesh.rotation.z = Math.PI / 2;
    mesh.baseY = y;
    mesh.bobOffset = Math.random() * Math.PI * 2;
    // console.log("created coin at: ", x, y, z) //enable to check coin
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

    mesh.baseY = y;
    mesh.bobOffset = Math.random() * Math.PI * 2;

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
        const mat = new THREE.MeshStandardMaterial({ color: 0xff0000, wireframe: true });
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

function createPromptTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');

    // Cirkel achtergrond
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath();
    ctx.arc(64, 64, 60, 0, Math.PI * 2);
    ctx.fill();

    // Rand
    ctx.strokeStyle = '#FFD700'; // Goud
    ctx.lineWidth = 10;
    ctx.stroke();

    // Tekst "E"
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 80px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('E', 64, 68);

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
}


// --- RONNIE & ABILITIES ---

function createRonnieStall(scene, position) {
    const stall = new THREE.Group();
    
    // Base platform (wooden floor)
    const floorGeo = new THREE.BoxGeometry(3, 0.2, 2);
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
    const floor = new THREE.Mesh(floorGeo, woodMat);
    floor.position.y = 0.1;
    floor.castShadow = true;
    floor.receiveShadow = true;
    stall.add(floor);
    
    // Back wall
    const backWall = new THREE.Mesh(
        new THREE.BoxGeometry(3, 2, 0.2),
        woodMat
    );
    backWall.position.set(0, 1, -0.9);
    backWall.castShadow = true;
    stall.add(backWall);
    
    // Roof
    const roofGeo = new THREE.BoxGeometry(3.5, 0.1, 2.5);
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x654321 });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = 2.5;
    roof.castShadow = true;
    stall.add(roof);
    
    // Left support pole
    const poleGeo = new THREE.CylinderGeometry(0.1, 0.1, 2.5);
    const leftPole = new THREE.Mesh(poleGeo, woodMat);
    leftPole.position.set(-1.3, 1.25, -0.7);
    leftPole.castShadow = true;
    stall.add(leftPole);
    
    // Right support pole
    const rightPole = new THREE.Mesh(poleGeo, woodMat);
    rightPole.position.set(1.3, 1.25, -0.7);
    rightPole.castShadow = true;
    stall.add(rightPole);
    
    // Counter (front)
    const counter = new THREE.Mesh(
        new THREE.BoxGeometry(3, 0.8, 0.3),
        new THREE.MeshStandardMaterial({ color: 0xA0522D })
    );
    counter.position.set(0, 0.6, 0.85);
    counter.castShadow = true;
    stall.add(counter);
    
    // Position the entire stall
    stall.position.set(position.x, position.y, position.z);
    if (position.rotation) {
        stall.rotation.y = position.rotation;
    }
    scene.add(stall);
    
    console.log("🏪 Ronnie's stall created!");
}


export function loadRonnie(scene, gltfLoader, position) {
    const quality = assetRegistry.getGraphicsQuality() === 'low' ? 'low' : 'high';
    const ronnieUrl = assetRegistry.getModelUrl('ronnie', quality);

    gltfLoader.load(ronnieUrl, (gltf) => {
        const ronnie = gltf.scene;
        ronnie.scale.set(1.3, 1.3, 1.3);
        ronnie.position.set(position.x, position.y, position.z);
        // Laat Ronnie naar de spawn kijken (draai 180 graden indien nodig)
        ronnie.rotation.y = Math.PI;

        ronnie.traverse((child) => {
            if (child.isMesh) {
                child.userData.isRonnie = true;
                // Zorg dat de parent ook herkenbaar is
                child.userData.parentGroup = ronnie;
            }
        });

        ronnie.userData.isRonnie = true;
        const promptMat = new THREE.SpriteMaterial({
            map: createPromptTexture(),
            transparent: true,
            depthTest: false, // Zorg dat hij altijd bovenop rendered (optioneel)
            depthWrite: false
        });
        const promptSprite = new THREE.Sprite(promptMat);
        promptSprite.position.set(0, 2.8, 0); // Zweeft boven zijn hoofd
        promptSprite.scale.set(0.8, 0.8, 0.8);
        promptSprite.visible = false; // Standaard onzichtbaar
        promptSprite.name = "InteractionPrompt"; // Makkelijk terugvinden

        ronnie.add(promptSprite);
        // ------------------------------------------------

        scene.add(ronnie);

        // Sla Ronnie globaal op zodat main.js hem makkelijk kan vinden voor afstands-check
        window.ronnie = ronnie;

        console.log("🧥 Ronnie (met E-prompt) is aanwezig.");
    }, undefined, (err) => console.warn("Ronnie model niet gevonden.", err));
}

export function summonCloudPlatform(playerPos, scene, platforms, texture) {
    // Create shared material (same as world clouds)
    const cloudMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.9,
        metalness: 0.1,
        flatShading: true
    });

    // Spawn a normal cloud platform below player
    const w = 4, h = 1.5, d = 4;
    const mainMesh = createPlat(
        playerPos.x, 
        playerPos.y - 2, 
        playerPos.z, 
        w, h, d, 
        scene, 
        platforms, 
        cloudMaterial
    );

    // Mark it as temporary so we can remove it later
    mainMesh.userData.isTemporary = true;

    // Fade out and remove after 8 seconds
    setTimeout(() => {
        const fadeInterval = setInterval(() => {
            cloudMaterial.opacity -= 0.05;
            cloudMaterial.transparent = true;
            
            if (cloudMaterial.opacity <= 0) {
                clearInterval(fadeInterval);
                
                // Remove ALL meshes created by createPlat (main + puffs)
                platforms.forEach((p, idx) => {
                    if (p.material === cloudMaterial) {
                        scene.remove(p);
                        platforms.splice(idx, 1);
                    }
                });
            }
        }, 50);
    }, 8000);
}

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

        puffMesh.castShadow = false;
        puffMesh.receiveShadow = true;
        puffMesh.userData.isPlatform = true;

        scene.add(puffMesh);
        platforms.push(puffMesh);
    }
    
    // ADD THIS LINE AT THE END:
    return mainMesh; // Return the main mesh so we can reference it later
}

function createCloudySky() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    // Sky gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#4A90E2');
    gradient.addColorStop(0.7, '#87CEEB');
    gradient.addColorStop(1, '#B0E0E6');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Paint some soft clouds
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    for (let i = 0; i < 15; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height * 0.6;
        const w = 80 + Math.random() * 120;
        const h = 30 + Math.random() * 50;
        
        ctx.beginPath();
        ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    
    // Create MUCH larger sky sphere - USE BASIC MATERIAL (doesn't need light)
    const skyGeo = new THREE.SphereGeometry(500, 32, 32);
    const skyMat = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.BackSide,
        fog: false  // Sky not affected by fog
    });
    
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.userData.skyMaterial = skyMat;
    sky.name = 'SkySphere';
    
    return sky;
}