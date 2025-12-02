import * as THREE from 'three';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/DRACOLoader.js'; 
import { SkeletonUtils } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/utils/SkeletonUtils.js'; // NIEUW: Voor het correct klonen van Skinned Meshes
import { doc, getDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

let worldUnsubscribe = null; // Store unsubscribe function

// --- GLOBAL ASSET CONFIGURATION ---
// Adjust these values to determine scale and rotation speed.
const ASSET_CONFIG = {
    // COIN SETTINGS
    COIN_SCALE: 0.5,           // Adjust to change coin size
    COIN_ROTATION_SPEED: 2.0,  // Rotation speed (used in main.js)
    
    // ENEMY SETTINGS
    ENEMY_SCALE: 1.4,          
    // Bounding Sphere-benadering voor model-gebaseerde hitbox
    ENEMY_COLLISION_DISTANCE: 0.3, 
};
export { ASSET_CONFIG }; 

// --- ASSET LOADING ---
let cachedCoinScene = null; // Slaat de scene op, om te klonen
let cachedEnemyGLTF = null; // Slaat de volledige GLTF op, nodig voor SkeletonUtils en animaties

// Setup Draco Loader
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader); // Attach Draco to GLTF loader

// Load Coin GLB
gltfLoader.load('assets/coin.glb', (gltf) => {
    cachedCoinScene = gltf.scene; // Sla de scene op
    
    // Apply scale based on CONFIG
    cachedCoinScene.scale.set(ASSET_CONFIG.COIN_SCALE, ASSET_CONFIG.COIN_SCALE, ASSET_CONFIG.COIN_SCALE); 
    
    // Enable shadows for the coin parts
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
    cachedEnemyGLTF = gltf; // Sla het volledige GLTF-object op
    
    // Enable shadows on the original scene (will be inherited by clones)
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

    // Clean up existing objects (Essential for memory management)
    platforms.forEach(p => {
        scene.remove(p);
        if (p.geometry) p.geometry.dispose();
        // Do not dispose material if it is marked as shared, to avoid errors on reload
        if (p.material && !p.material.userData.isShared) p.material.dispose();
    });
    platforms.length = 0;
    
    coins.forEach(c => scene.remove(c)); coins.length = 0;
    
    // Verwijder vijanden en dispose hun mixers
    enemies.forEach(e => {
        scene.remove(e);
        if (e.userData.mixer) e.userData.mixer = null; // Clean up mixer reference
    }); 
    enemies.length = 0;
    
    projectiles.forEach(p => scene.remove(p.mesh)); projectiles.length = 0;

    let worldData = null;

    if (isMultiplayer) {
        try {
            const worldDocRef = doc(db, "levels", "main_world");
            
            // OPTIMIZATION: Try to load from localStorage first to avoid read
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

            // Only fetch from Firebase if no cache
            if (!worldData) {
                const docSnap = await getDoc(worldDocRef);

                if (docSnap.exists()) {
                    console.log("☁️ Fetched world from Firebase (1 read)");
                    worldData = docSnap.data();
                    
                    // Cache it for next time
                    localStorage.setItem('cachedWorld', JSON.stringify(worldData));
                } else {
                    console.log("No world found, generating new one...");
                    worldData = generateWorldData(CASTLE_Z);
                    await setDoc(worldDocRef, worldData);
                    localStorage.setItem('cachedWorld', JSON.stringify(worldData));
                }
            }

            // OPTIMIZATION: Only listen if not already listening
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

    // Fallback if data is empty
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

        // Skip initial load (already handled by syncAndBuildWorld)
        if (lastWorldTimestamp === null) {
            lastWorldTimestamp = currentTimestamp;
            return;
        }

        // If world changed, rebuild it
        if (currentTimestamp !== lastWorldTimestamp) {
            console.log("🌍 World regenerated! Reloading...");
            lastWorldTimestamp = currentTimestamp;

            // Update cache
            localStorage.setItem('cachedWorld', JSON.stringify(data));

            // Clear old world (Optimized with dispose)
            platforms.forEach(p => {
                scene.remove(p);
                if (p.geometry) p.geometry.dispose();
                // Do not dispose shared material
                if (p.material && !p.material.userData.isShared) p.material.dispose();
            });
            platforms.length = 0;
            
            coins.forEach(c => scene.remove(c));
            coins.length = 0;
            
            // Verwijder vijanden en dispose hun mixers
            enemies.forEach(e => {
                scene.remove(e);
                if (e.userData.mixer) e.userData.mixer = null; // Clean up mixer reference
            });
            enemies.length = 0;

            // Build new world
            buildWorldFromData(data, scene, CASTLE_Z, platforms, coins, enemies, platformTexture, textureLoader);

            // Optional: Show notification to player
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

    // Return unsubscribe for cleanup
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
        // Place coins higher for rounded clouds
        if (Math.random() > 0.4) data.coins.push({ x, y: y + 3, z }); 
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
        { x: 7, z: 0, w: 1,  h: 6, d: 14 },
        { x:-7, z: 0, w: 1,  h: 6, d: 14 }
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
    
    // 1. CREATE SHARED MATERIAL (Optimization: Create once, use everywhere)
    const sharedCloudMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.9,
        metalness: 0.1,
        flatShading: true // Gives the low-poly look
    });
    sharedCloudMaterial.userData.isShared = true;

    // 2. BUILD PLATFORMS
    if (data.platforms) {
        data.platforms.forEach(p => {
            // Note: We pass 'sharedCloudMaterial'
            createPlat(p.x, p.y, p.z, p.w, p.h, p.d, scene, platforms, sharedCloudMaterial);
        });
    }

    // 3. BUILD OTHERS
    if (data.coins) data.coins.forEach(c => createCoin(c.x, c.y, c.z, scene, coins));
    
    // UPDATED: No longer pass textureLoader to createEnemy
    if (data.enemies) {
        // BELANGRIJKE WIJZIGING: platforms doorgeven voor de Raycast in createEnemy
        data.enemies.forEach(e => createEnemy(e.x, e.y, e.z, scene, enemies, platforms));
    }

    createCastle(scene, CASTLE_Z);
}

// --- ROUND CLOUD GENERATION ---
function createPlat(x, y, z, w, h, d, scene, platforms, material) {
    const useMat = material || new THREE.MeshStandardMaterial({ color: 0xffffff });

    // 1. Calculate a base radius based on the dimensions
    // We use the smallest dimension to keep it roundish but stretched
    const baseRadius = Math.min(w, d) * 0.4;

    // 2. Create the CENTRAL shape (The core)
    // IcosahedronGeometry with detail 0 = Low Poly Sphere (20 faces)
    const mainGeo = new THREE.IcosahedronGeometry(baseRadius, 0);
    const mainMesh = new THREE.Mesh(mainGeo, useMat);
    
    // Flatten it slightly to make it more platform-like
    mainMesh.scale.set(w / baseRadius * 0.5, h / baseRadius * 0.5, d / baseRadius * 0.5);
    mainMesh.position.set(x, y, z);
    
    mainMesh.castShadow = true;
    mainMesh.receiveShadow = true;
    mainMesh.userData.isPlatform = true;

    scene.add(mainMesh);
    platforms.push(mainMesh); // Add core to collision

    // 3. Add "PUFFS" (Round spheres around the center)
    const puffCount = 4 + Math.floor(Math.random() * 4);

    for (let i = 0; i < puffCount; i++) {
        const puffRadius = baseRadius * (0.6 + Math.random() * 0.5);
        const puffGeo = new THREE.IcosahedronGeometry(puffRadius, 0);
        const puffMesh = new THREE.Mesh(puffGeo, useMat);

        // Position loosely around the center
        puffMesh.position.set(
            x + (Math.random() - 0.5) * w * 0.8,
            y + (Math.random() - 0.5) * h * 0.5, 
            z + (Math.random() - 0.5) * d * 0.8
        );

        // Random rotation
        puffMesh.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);

        puffMesh.castShadow = true;
        puffMesh.receiveShadow = true;
        puffMesh.userData.isPlatform = true;

        scene.add(puffMesh);
        
        // CRITICAL FIX: Add EVERY puff to the collision array
        // This ensures you can stand on the edges of the cluster
        platforms.push(puffMesh); 
    }
}

// --- COIN GENERATION (Uses GLB or Fallback) ---
function createCoin(x, y, z, scene, coins) {
    let mesh;

    if (cachedCoinScene) { // Gebruik cachedCoinScene
        // A. If the 3D model is loaded, clone it!
        // Scale is already set on the original scene
        mesh = cachedCoinScene.clone();
        mesh.position.set(x, y, z);
        
    } else {
        // B. Fallback: If model is not ready, use the old cylinder
        mesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.5 * ASSET_CONFIG.COIN_SCALE, 0.5 * ASSET_CONFIG.COIN_SCALE, 0.1 * ASSET_CONFIG.COIN_SCALE, 12),
            new THREE.MeshPhongMaterial({ color: 0xffd700 })
        );
        mesh.position.set(x, y, z);
        mesh.rotation.x = Math.PI / 2; // Original cylinder needs to be rotated flat
    }

    mesh.castShadow = true; // Ensure coin casts shadow
    scene.add(mesh);
    coins.push(mesh);
}

// --- ENEMY GENERATION (Uses GLB or Red Placeholder) ---
function createEnemy(x, y, z, scene, enemies, platforms) {
    let mesh;

    if (cachedEnemyGLTF) { // Gebruik cachedEnemyGLTF
        // A. Use SkeletonUtils.clone() for Skinned Mesh
        mesh = SkeletonUtils.clone(cachedEnemyGLTF.scene);
        
        // 1. Apply scale based on CONFIG
        mesh.scale.set(ASSET_CONFIG.ENEMY_SCALE, ASSET_CONFIG.ENEMY_SCALE, ASSET_CONFIG.ENEMY_SCALE);
        
        // 2. Initialize AnimationMixer
        if (cachedEnemyGLTF.animations && cachedEnemyGLTF.animations.length > 0) {
            // Create a UNIQUE mixer for this clone
            const mixer = new THREE.AnimationMixer(mesh);
            const action = mixer.clipAction(cachedEnemyGLTF.animations[0]); 
            action.play();
            mesh.userData.mixer = mixer; 
        }

    } else {
        // B. Fallback: NO PNG anymore. Use red placeholder.
        const geo = new THREE.BoxGeometry(1, 1, 1);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
        mesh = new THREE.Mesh(geo, mat);
        mesh.userData.isPlaceholder = true;
    }

    // 1. Eerst de X en Z positioneren (de Y is nog de ruwe 'y+3')
    mesh.position.set(x, y, z);
    
    // 2. NIEUWE LOGICA: Vind de grondhoogte via Raycasting
    const raycaster = new THREE.Raycaster();
    // Start de straal 10 eenheden boven de initiële Y-positie van de vijand
    const rayOrigin = new THREE.Vector3(x, y + 10, z);
    const rayDirection = new THREE.Vector3(0, -1, 0); // Richting: recht naar beneden
    raycaster.set(rayOrigin, rayDirection);

    // Zoek intersectie met alle cloud-meshes in de platforms-array
    const intersects = raycaster.intersectObjects(platforms, true);

    if (intersects.length > 0) {
        const groundY = intersects[0].point.y;
        
        // DEFINITIEVE FIX: Geen offset. De pivot van het model zit op de voeten (0,0,0).
        mesh.position.y = groundY;
    }
    
    scene.add(mesh);
    enemies.push(mesh);
}

// Cleanup function to stop listeners (call this when leaving multiplayer)
export function cleanupWorldListener() {
    if (worldUnsubscribe) {
        worldUnsubscribe();
        worldUnsubscribe = null;
        console.log("🛑 World listener stopped");
    }
}