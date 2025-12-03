import * as THREE from 'three';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/DRACOLoader.js'; 
import { SkeletonUtils } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/utils/SkeletonUtils.js';
import { doc, getDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

let worldUnsubscribe = null;

// --- GLOBAL ASSET CONFIGURATION ---
const ASSET_CONFIG = {
    // COIN SETTINGS
    COIN_SCALE: 0.5,
    COIN_ROTATION_SPEED: 2.0,
    
    // ENEMY SETTINGS
    ENEMY_SCALE: 1.4,          
    ENEMY_COLLISION_DISTANCE: 0.3, 
};
export { ASSET_CONFIG }; 

// --- ASSET LOADING ---
let cachedCoinScene = null;
let cachedEnemyGLTF = null;

// Setup Draco Loader
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

// Load New Enemy GLB
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
// No longer generates coins during world generation
export function generateWorldData(CASTLE_Z) {
    const data = { 
        platforms: [], 
        coins: [], // Keep array but don't populate it here
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
        // REMOVED: No longer spawning coins here
        // if (Math.random() > 0.4) data.coins.push({ x, y: y + 3, z }); 
        if (Math.random() > 0.7) data.enemies.push({ x, y: y + 3, z });
        z -= (5 + Math.random() * 4);
    }
    // End platform (at castle)
    data.platforms.push({ x: 0, y: 0, z: CASTLE_Z, w: 20, h: 2, d: 20 });

    return data;
}

// --- LOW POLY CASTLE BUILDER ---
function createCastle(scene, CASTLE_Z) {
    console.log("creating castle...")
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
        [ 5, 5],
        [-5, 5],
        [ 5,-5],
        [-5,-5]
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
        { x: 0, z:-7, w: 14, h: 6, d: 1 },
        { x: 7, z: 0, w: 1,  h: 6, d: 14 },
        { x:-7, z: 0, w: 1,  h: 6, d: 14 }
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

    // // MODIFIED: Only build coins if they exist in data (for backward compatibility)
    // if (data.coins && data.coins.length > 0) {
    //     data.coins.forEach(c => createCoin(c.x, c.y, c.z, scene, coins));
    // }
    
    if (data.enemies) {
        data.enemies.forEach(e => createEnemy(e.x, e.y, e.z, scene, enemies, platforms));
    }

    createCastle(scene, CASTLE_Z);
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

        puffMesh.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);

        puffMesh.castShadow = true;
        puffMesh.receiveShadow = true;
        puffMesh.userData.isPlatform = true;

        scene.add(puffMesh);
        platforms.push(puffMesh); 
    }
}

// --- COIN GENERATION (Uses GLB or Fallback) ---
function createCoin(x, y, z, scene, coins) {
    let mesh;

    if (cachedCoinScene) {
        mesh = cachedCoinScene.clone();
        mesh.position.set(x, y, z);
        
    } else {
        mesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.5 * ASSET_CONFIG.COIN_SCALE, 0.5 * ASSET_CONFIG.COIN_SCALE, 0.1 * ASSET_CONFIG.COIN_SCALE, 12),
            new THREE.MeshPhongMaterial({ color: 0xffd700 })
        );
        mesh.position.set(x, y, z);
        mesh.rotation.x = Math.PI / 2;
    }

    mesh.castShadow = true;
    scene.add(mesh);
    coins.push(mesh);
}

// Export function to spawn coin at enemy position
export function spawnCoinAtPosition(x, y, z, scene, coins) {
    createCoin(x, y, z, scene, coins);
    console.log(`🪙 Coin spawned at (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`);
}

// --- ENEMY GENERATION (Uses GLB or Red Placeholder) ---
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

// Cleanup function to stop listeners
export function cleanupWorldListener() {
    if (worldUnsubscribe) {
        worldUnsubscribe();
        worldUnsubscribe = null;
        console.log("🛑 World listener stopped");
    }
}