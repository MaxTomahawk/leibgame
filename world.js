import * as THREE from 'three';
import { doc, getDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

// --- WERELD SYNC LOGICA ---
export async function syncAndBuildWorld(scene, ui, platforms, coins, enemies, projectiles, isMultiplayer, db, CASTLE_Z, platformTexture, textureLoader) {
    ui.status.innerText = "Wereld laden...";

    // Maak alles leeg
    platforms.forEach(p => scene.remove(p)); platforms.length = 0;
    coins.forEach(c => scene.remove(c)); coins.length = 0;
    enemies.forEach(e => scene.remove(e)); enemies.length = 0;
    projectiles.forEach(p => scene.remove(p.mesh)); projectiles.length = 0;

    let worldData = null;

    if (isMultiplayer) {
        try {
            const worldDocRef = doc(db, "levels", "main_world");
            const docSnap = await getDoc(worldDocRef);

            if (docSnap.exists()) {
                console.log("Bestaande wereld gevonden!");
                worldData = docSnap.data();
            } else {
                console.log("Geen wereld gevonden, nieuwe genereren...");
                worldData = generateWorldData(CASTLE_Z);
                await setDoc(worldDocRef, worldData);
            }

            // ✅ FIX 2: Listen for world changes
            setupWorldListener(worldDocRef, scene, CASTLE_Z, platforms, coins, enemies, platformTexture, textureLoader);

        } catch (e) {
            console.error("Fout bij ophalen wereld (waarschijnlijk rechten):", e);
            ui.status.innerHTML = "⚠️ <strong>Database Fout:</strong> Toegang geweigerd.<br><small>Check je Firestore Rules in de Console.</small>";
            ui.status.className = "bg-red-100 text-red-800 p-3 rounded mb-4 border border-red-400";
            worldData = generateWorldData(CASTLE_Z);
        }
    } else {
        worldData = generateWorldData(CASTLE_Z);
    }

    if (!worldData || !worldData.platforms || worldData.platforms.length === 0) {
        console.warn("Ontvangen wereld data was leeg, fallback naar lokaal.");
        worldData = generateWorldData(CASTLE_Z);
    }

    buildWorldFromData(worldData, scene, CASTLE_Z, platforms, coins, enemies, platformTexture, textureLoader);

    if (!ui.status.innerText.includes("Fout")) {
        ui.status.innerText = "Veel plezier!";
    }
}

// New function to listen for world regeneration
function setupWorldListener(worldDocRef, scene, CASTLE_Z, platforms, coins, enemies, platformTexture, textureLoader) {
    let lastWorldTimestamp = null;

    onSnapshot(worldDocRef, (docSnap) => {
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

            // Clear old world
            platforms.forEach(p => scene.remove(p));
            platforms.length = 0;
            coins.forEach(c => scene.remove(c));
            coins.length = 0;
            enemies.forEach(e => scene.remove(e));
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
            notification.innerText = "🌍 Nieuwe wereld geladen!";
            document.body.appendChild(notification);

            setTimeout(() => notification.remove(), 3000);
        }
    });
}

// --- WORLD DATA GENERATOR ---
export function generateWorldData(CASTLE_Z) {
    const data = { 
        platforms: [], 
        coins: [], 
        enemies: [],
        generatedAt: Date.now() // ✅ FIX 2: Add timestamp
    };

    data.platforms.push({ x: 0, y: -2, z: 0, w: 10, h: 2, d: 10 });

    let z = -10;
    while (z > CASTLE_Z + 20) {
        let x = (Math.random() - 0.5) * 30;
        let y = (Math.random() - 0.5) * 6;
        let w = 3 + Math.random() * 5;
        let h = 1 + Math.random() * 2;
        let d = 3 + Math.random() * 5;

        data.platforms.push({ x, y, z, w, h, d });
        if (Math.random() > 0.4) data.coins.push({ x, y: y + 2, z });
        if (Math.random() > 0.7) data.enemies.push({ x, y: y + 3, z });
        z -= (4 + Math.random() * 4);
    }
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
    if (data.platforms) data.platforms.forEach(p => createPlat(p.x, p.y, p.z, p.w, p.h, p.d, scene, platforms, platformTexture));
    if (data.coins) data.coins.forEach(c => createCoin(c.x, c.y, c.z, scene, coins));
    if (data.enemies) data.enemies.forEach(e => createEnemy(e.x, e.y, e.z, scene, enemies, textureLoader));

    createCastle(scene, CASTLE_Z);
}

// --- OBJECT CREATORS ---
function createPlat(x, y, z, w, h, d, scene, platforms, platformTexture) {
    const box = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshBasicMaterial({ visible: false })
    );
    box.position.set(x, y, z);
    box.userData = { w, h, d };
    scene.add(box);
    platforms.push(box);

    let tex = null;
    if (platformTexture) {
        tex = platformTexture.clone();
        tex.repeat.set(w / 2, d / 2);
        tex.needsUpdate = true;
    }

    const topMat = new THREE.MeshLambertMaterial({
        color: 0xffffff,
        map: tex,
        transparent: true,
        alphaTest: 0.1
    });

    const topPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(w, d),
        topMat
    );
    topPlane.rotation.x = -Math.PI / 2;
    topPlane.position.set(x, y + h / 2 + 0.01, z);
    topPlane.receiveShadow = true;
    scene.add(topPlane);
}

function createCoin(x, y, z, scene, coins) {
    const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 0.1),
        new THREE.MeshPhongMaterial({ color: 0xffd700 })
    );
    mesh.position.set(x, y, z);
    mesh.rotation.x = Math.PI / 2;
    scene.add(mesh);
    coins.push(mesh);
}

function createEnemy(x, y, z, scene, enemies, textureLoader) {
    const tex = textureLoader.load('assets/enemy.png');
    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(3.5, 2.75),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
    );
    mesh.position.set(x, y, z);
    scene.add(mesh);
    enemies.push(mesh);
}