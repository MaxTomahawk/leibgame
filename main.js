import * as THREE from 'three';
import { 
    initFirebase, 
    db, 
    auth, 
    linkAnonymousAccountToEmail, 
    loginWithEmail, 
    logout 
} from './firebase.js';
import { listenToPlayers, startBroadcasting, updateOtherPlayerAnimations } from './multiplayer.js';
import { getDoc, setDoc, doc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { syncAndBuildWorld, generateWorldData, ASSET_CONFIG, spawnStarAtPosition } from './world.js';
import { MobileControls } from './mobile-controls.js';
import { AudioManager } from './audio-manager.js';
import { ModelManager, MODEL_SCALES, getModelAppearance } from './model-manager.js';
import { UIManager } from './ui-manager.js';
import { ShopSystem } from './shop-system.js';
import { SettingsManager } from './settings-manager.js';
import { loadRonnie, summonCloudPlatform } from './world.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/GLTFLoader.js';

let selectedModelFile = 'assets/leib.glb'; // default
let gameVersion = { commit: 'loading...', date: 'loading...' };

// --- PHYSICS & GAMEPLAY SETTINGS ---
const CASTLE_Z = -300;
const BUFF_DURATION = 8000;

// --- COLOR CONFIGURATION (Day/Night/Trip) ---
const dayBg = new THREE.Color(0x87CEEB);
const dayFog = new THREE.Color(0x87CEEB);

const nightBg = new THREE.Color(0x020210);
const nightFog = new THREE.Color(0x050515);

const tripFog = new THREE.Color(0x00ff00);
const tripBg = new THREE.Color(0x113311);

let isDarkMode = false;

// --- GLOBALS ---
let userId, myName = "Player", isMultiplayer = false;
let camera, scene, renderer, player = {};
let modelManager = new ModelManager();
let uiManager; // New UI Manager instance
let velocity = new THREE.Vector3();
let platforms = [], coins = [], enemies = [], otherPlayers = {}, projectiles = [];
window.gameState = 'start';
let coinsCollected = 0;
let starsCollected = 0;
let moveF = false, moveB = false, moveL = false, moveR = false;
let isSprinting = false;
let cameraPitch = 0;
let textureLoader;
let modelLoaded = false;
let platformTexture = null;
let mobile = null;
let audioManager;
let shopSystem, settingsManager;
let jumpCount = 0;

const raycaster = new THREE.Raycaster();
const downDirection = new THREE.Vector3(0, -1, 0);

// Trip Mode Variables
let isTripping = false;
let tripTimer = null;
let currentGravity = 20.0;
let targetGravity = 20.0;

// Fetch version on load
fetch('version.json')
    .then(r => r.json())
    .then(v => {
        gameVersion = v;
        if(uiManager) uiManager.setVersion(v.commit, v.date);
    })
    .catch(e => {
        console.warn('Could not load version:', e);
        gameVersion = { commit: 'dev', date: 'local' };
        if(uiManager) uiManager.setVersion('dev', 'local');
    });

function handleMobileControls(mobile) {
    mobile.onJump = () => performJump();
    mobile.onShoot = () => performShoot();
    mobile.onAbility = () => activateWeed();
}

// Saves player stats to Firestore
async function saveUserProgress() {
    if (!auth.currentUser) return;
    try {
        const userRef = doc(db, "users", auth.currentUser.uid);
        await setDoc(userRef, {
            coins: coinsCollected,
            stars: starsCollected,
            lastSaved: Date.now()
        }, { merge: true });
    } catch (e) {
        console.error("Error saving progress:", e);
    }
}

window.onload = async () => {
    // Initialize UI Manager first
    uiManager = new UIManager();
    settingsManager = new SettingsManager();
    uiManager.setVersion(gameVersion.commit, gameVersion.date);

    uiManager.setupThemeToggle(settingsManager, (newTheme) => {
        // Callback: forceer update van graphics als er geklikt wordt
        isDarkMode = getEffectiveDarkMode();
        console.log("Theme changed to:", newTheme, "Effective Dark Mode:", isDarkMode);
        // De animate loop pakt de nieuwe 'isDarkMode' waarde automatisch op in de volgende frame
    });

    isDarkMode = getEffectiveDarkMode();

    initThreeJS();
    mobile = new MobileControls();
    handleMobileControls(mobile);
    
    // Set controls hint based on device
    uiManager.setControlsHint(mobile.enabled);

    try {
        uiManager.updateStatus("firebase", "🔌 Connecting...", "blue");

        const firebaseGlobals = initFirebase(async (user) => {
            userId = user.uid;
            isMultiplayer = true;
            console.log("Firebase connected! User ID:", userId);
            uiManager.updateStatus("firebase", "✅ Multiplayer connected!", "green");
            shopSystem = new ShopSystem(uiManager, db, auth);
            await shopSystem.syncUserData(userId); 

            // Load saved progress (Stars/Coins)
            const userRef = doc(db, "users", userId);
            getDoc(userRef).then((snap) => {
                if (snap.exists()) {
                    const data = snap.data();
                    coinsCollected = data.coins || 0;
                    starsCollected = data.stars || 0;
                    
                    uiManager.initHUD(coinsCollected, starsCollected);
                    console.log("Progress loaded from database.");
                }
            });

            checkIfReadyToStart();
            // Pass uiManager as 'ui' param to listenToPlayers so it can update peer count
            listenToPlayers(scene, userId, { peers: uiManager.dom.peerCount }, db);
        });
    } catch (e) {
        console.error("Firebase init error:", e);
        uiManager.updateStatus("firebase", "⚠️ Offline Mode (Config Error)", "yellow");
        isMultiplayer = false;
        checkIfReadyToStart();
    }
};

function checkIfReadyToStart() {
    console.log("Ready check: modelLoaded =", modelLoaded, ", isMultiplayer =", isMultiplayer, ", userId =", userId);
    if (modelLoaded && (!isMultiplayer || (isMultiplayer && userId))) {
        uiManager.enableStartButton();
    }
}

function createSkyAtmosphere(scene) {
    // 1. DISTANT GROUND/HORIZON
    const groundGeo = new THREE.PlaneGeometry(2000, 2000);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x3a5f3a, fog: true });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -100;
    scene.add(ground);

    // 2. NATURAL MOUNTAIN LANDSCAPE
    const mountainRanges = [];
    const clusters = [
        { centerX: -200, centerZ: -150, count: 25, spread: 120 },
        { centerX: 200, centerZ: -200, count: 20, spread: 100 },
        { centerX: -180, centerZ: 50, count: 15, spread: 80 },
        { centerX: 180, centerZ: 100, count: 12, spread: 70 },
        { centerX: 0, centerZ: -450, count: 30, spread: 150 },
        { centerX: -100, centerZ: -350, count: 18, spread: 90 },
        { centerX: 100, centerZ: -380, count: 18, spread: 90 }
    ];

    clusters.forEach(cluster => {
        for (let i = 0; i < cluster.count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = (Math.random() + Math.random()) / 2 * cluster.spread;
            const x = cluster.centerX + Math.cos(angle) * distance;
            const z = cluster.centerZ + Math.sin(angle) * distance;
            const distFromOrigin = Math.sqrt(x * x + z * z);
            const heightVariation = 100 + Math.random() * 120;
            const height = heightVariation * (0.8 + (distFromOrigin / 400) * 0.4);
            const width = 20 + Math.random() * 25;

            const mountainGeo = new THREE.ConeGeometry(width, height, 4);
            const mountainMat = new THREE.MeshLambertMaterial({
                color: new THREE.Color().setHSL(0.28 + Math.random() * 0.12, 0.15 + Math.random() * 0.2, 0.2 + Math.random() * 0.2),
                fog: true
            });

            const mountain = new THREE.Mesh(mountainGeo, mountainMat);
            mountain.position.x = x + (Math.random() - 0.5) * 20;
            mountain.position.z = z + (Math.random() - 0.5) * 20;
            mountain.position.y = -50 + Math.random() * 30;
            mountain.rotation.y = Math.random() * Math.PI * 2;
            scene.add(mountain);
            mountainRanges.push(mountain);
        }
    });

    // 3. UFOs
    const ufos = [];
    for (let i = 0; i < 60; i++) { 
        const ufoGroup = new THREE.Group();
        const bodyGeo = new THREE.CylinderGeometry(1.5, 2.5, 0.6, 32, 1, true);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.7, roughness: 0.3 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        ufoGroup.add(body);

        const domeGeo = new THREE.SphereGeometry(0.75, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2);
        const domeMat = new THREE.MeshStandardMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.6, metalness: 0.2, roughness: 0.1 });
        const dome = new THREE.Mesh(domeGeo, domeMat);
        dome.position.y = 0.3;
        ufoGroup.add(dome);

        const ringGeo = new THREE.TorusGeometry(2.5, 0.1, 16, 100);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = -0.05;
        ufoGroup.add(ring);

        const startX = (Math.random() - 0.5) * 500;
        const startY = -20 + Math.random() * 50;
        const startZ = (Math.random() - 0.5) * 200;
        
        ufoGroup.position.set(startX, startY, startZ);
        scene.add(ufoGroup);

        ufos.push({
            group: ufoGroup,
            speed: 0.5 + Math.random() * 0.5,
            pathFrequencyX: 0.2 + Math.random() * 0.3,
            pathFrequencyY: 0.1 + Math.random() * 0.2,
            pathFrequencyZ: 0.15 + Math.random() * 0.25,
            pathAmplitudeX: 20 + Math.random() * 30,
            pathAmplitudeY: 5 + Math.random() * 5,
            pathAmplitudeZ: 10 + Math.random() * 20,
            rotationSpeed: 0.1 + Math.random() * 0.2,
            startX: startX, startY: startY, startZ: startZ
        });
    }

    // 4. SPEED PARTICLES
    const particles = [];
    for (let i = 0; i < 2500; i++) {
        const particleGeo = new THREE.SphereGeometry(0.12, 6, 6);
        const particleMat = new THREE.MeshBasicMaterial({
            color: new THREE.Color().setHSL(Math.random(), 1.0, 0.6),
            transparent: true, opacity: 0.9, blending: THREE.NormalBlending
        });

        const particle = new THREE.Mesh(particleGeo, particleMat);
        particle.position.x = (Math.random() - 0.5) * 300;
        particle.position.y = -10 + Math.random() * 80;
        particle.position.z = (Math.random() - 0.5) * 300;
        particle.rotation.x = (Math.random() - 0.5) * 0.3;
        particle.rotation.y = (Math.random() - 0.5) * 0.3;

        scene.add(particle);
        particles.push({ mesh: particle, speed: 6 + Math.random() * 55, hueOffset: Math.random() * Math.PI * 2 });
    }
    return { ufos, particles };
}

function animateAtmosphere(atmosphereObjects, delta) {
    const time = Date.now() * 0.001;
    if (atmosphereObjects.ufos) {
        atmosphereObjects.ufos.forEach(ufo => {
            const forward = ufo.speed * delta * 50;
            ufo.group.position.x = ufo.startX + Math.sin(time * ufo.pathFrequencyX) * ufo.pathAmplitudeX + forward;
            ufo.group.position.y = ufo.startY + Math.sin(time * ufo.pathFrequencyY) * ufo.pathAmplitudeY;
            ufo.group.position.z = ufo.startZ + Math.sin(time * ufo.pathFrequencyZ) * ufo.pathAmplitudeZ;
            ufo.group.rotation.y += ufo.rotationSpeed * delta;

            const ring = ufo.group.children.find(c => c.geometry && c.geometry.type === 'TorusGeometry');
            if (ring && ring.material) {
                const pulse = Math.abs(Math.sin(time * 4 + ufo.group.position.x * 0.01)) * 0.6 + 0.6;
                ring.material.opacity = Math.min(1.0, pulse);
                ring.scale.set(0.8 + pulse * 0.6, 0.8 + pulse * 0.6, 1);
            }
        });
    }
    if (atmosphereObjects.particles) {
        atmosphereObjects.particles.forEach(p => {
            p.mesh.position.z += p.speed * delta * 60 * 0.016;
            if (p.mesh.position.z > 120) {
                p.mesh.position.z = -240;
                p.mesh.position.x = (Math.random() - 0.5) * 300;
                p.mesh.position.y = -10 + Math.random() * 80;
            }
            const hue = (Math.sin(time * 2 + p.hueOffset) * 0.5 + 0.5);
            p.mesh.material.color.setHSL(hue, 1.0, 0.6);
        });
    }
}

const AUDIO_ASSETS = {
    bgm: 'assets/sounds/soundtrack/hava_leib.mp3',
    jump: 'assets/sounds/effects/male_jump.wav',
    coin: 'assets/sounds/effects/coin.wav',
    hava: 'assets/sounds/effects/hava.wav',
    shoot: 'assets/sounds/effects/spit.wav',
    gameover: 'assets/sounds/fail.wav'
};

async function setupAudio() {
    audioManager = new AudioManager(camera);
    const loadPromises = Object.entries(AUDIO_ASSETS).map(([key, path]) => {
        return audioManager.load(key, path);
    });
    try {
        await Promise.all(loadPromises);
        console.log("🔊 Audio system ready!");
    } catch (error) {
        console.warn("⚠️ Some sounds failed to load:", error);
    }
}

function initThreeJS() {
    scene = new THREE.Scene();
    
    scene.background = isDarkMode ? nightBg.clone() : dayBg.clone();
    scene.fog = new THREE.Fog(isDarkMode ? nightFog.clone() : dayFog.clone(), 10, 90);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.25);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = true;
    scene.add(dirLight);
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.3);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    window.gameLights = { ambient, dirLight, hemiLight };

    const atmosphereObjects = createSkyAtmosphere(scene);
    window.atmosphereObjects = atmosphereObjects; 

    textureLoader = new THREE.TextureLoader();
    renderer.outputEncoding = THREE.sRGBEncoding;

    platformTexture = textureLoader.load(
        "assets/hava.png",
        (tex) => {
            tex.encoding = THREE.sRGBEncoding;
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(2, 2);
            platforms.forEach((p) => {
                if (p && p.material) {
                    const cloned = tex.clone();
                    cloned.repeat.set((p.userData.w || 1) / 2, (p.userData.d || 1) / 2);
                    cloned.needsUpdate = true;
                    p.material.map = cloned;
                    p.material.color = new THREE.Color(0xffffff);
                    p.material.transparent = true;
                    p.material.alphaTest = 0.1;
                    p.material.needsUpdate = true;
                }
            });
            console.log("Platform texture loaded.");
        },
        undefined,
        (err) => console.warn("Failed to load hava.png", err)
    );

    player = new THREE.Object3D();
    player.position.set(0, 5, 0);
    window.player = player;
    scene.add(player);
    loadRonnie(scene, new GLTFLoader(), { x: 0, y: 0, z: 5 });

    modelManager.loadPlayerModel(selectedModelFile, player, {
        onProgress: (type, msg, color) => {
            uiManager.updateStatus(type, msg, color);
        },
        onLoaded: (type, msg, color) => {
            uiManager.updateStatus(type, msg, color);
            modelLoaded = true; // Forceer naar true, ongeacht de tekst
            console.log("Model loaded event fired!"); // Debug log
            checkIfReadyToStart();
        },
        onError: (type, msg, color) => {
            uiManager.updateStatus(type, msg, color);
            modelLoaded = true; // Laat de speler toch starten (met placeholder/fout)
            checkIfReadyToStart();
        }
    });
    
    setupInputs();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    animate();
    setupAudio();
}

// --- GAMEPLAY FUNCTIONS ---
function activateWeed() {
    // Check of we mogen trippen
    if (window.gameState !== 'playing' || coinsCollected < 1 || isTripping) return;
    
    // Kosten verrekenen
    coinsCollected--;
    uiManager.updateHUD({ coins: coinsCollected });
    saveUserProgress();

    // Trip starten
    isTripping = true;
    document.body.classList.add('tripping');

    clearTimeout(tripTimer);
    tripTimer = setTimeout(() => {
        isTripping = false;
        document.body.classList.remove('tripping');
    }, BUFF_DURATION);
}

function endGame(reason, won = false) {
    window.gameState = 'ended';
    document.exitPointerLock();
    uiManager.showGameOver(reason, won); // Use UI Manager

    if (won && isMultiplayer) {
        console.log("🏆 Player won! Regenerating world...");
        regenerateWorld();
    }
}

async function regenerateWorld() {
    try {
        const worldData = generateWorldData(CASTLE_Z);
        await setDoc(doc(db, "levels", "main_world"), worldData);
        console.log("✅ New world generated and saved!");
    } catch (e) {
        console.error("❌ Failed to regenerate world:", e);
    }
}

function getNearestPlayerPosition(enemyPosition) {
    let closestTarget = player.position; 
    let minDistance = enemyPosition.distanceTo(player.position);

    if (otherPlayers) {
        Object.values(otherPlayers).forEach(op => {
            if (op.mesh) {
                const dist = enemyPosition.distanceTo(op.mesh.position);
                if (dist < minDistance) {
                    minDistance = dist;
                    closestTarget = op.mesh.position;
                }
            }
        });
    }
    return closestTarget;
}

// --- GAME LOOP ---
let isGrounded = false;

function getEffectiveDarkMode() {
    if (!settingsManager) {
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    const theme = settingsManager.get('theme');
    
    if (theme === 'dark') return true;
    if (theme === 'light') return false;
    
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function animate() {
    requestAnimationFrame(animate);
    const now = Date.now();
    const delta = 0.016;

    isDarkMode = getEffectiveDarkMode();
    let targetBg = isTripping ? tripBg : (isDarkMode ? nightBg : dayBg);

    // Retrieve active modifiers from SettingsManager
    const mods = settingsManager.get('modifiers');

    if (window.atmosphereObjects) animateAtmosphere(window.atmosphereObjects, delta);

    modelManager.update(delta);
    if (isMultiplayer) {
        updateOtherPlayerAnimations(delta);
    }

    enemies.forEach(e => {
        if (e.userData.mixer) {
            e.userData.mixer.update(delta);
        }
    });

    if (window.gameState === 'playing') {
        // Handle environmental changes based on state
        let targetBg = isTripping ? tripBg : (isDarkMode ? nightBg : dayBg);
        let targetFog = isTripping ? tripFog : (isDarkMode ? nightFog : dayFog);

        scene.background.lerp(targetBg, delta * 2.0);
        scene.fog.color.lerp(targetFog, delta * 2.0);

        if (window.gameLights) {
            let targetAmbInt = 0.25;
            let targetDirInt = 0.6;
            let targetHemiInt = 0.3;
            let targetLightColor = new THREE.Color(0xffffff);

            if (isDarkMode && !isTripping) {
                targetAmbInt = 0.05;
                targetDirInt = 0.2;
                targetHemiInt = 0.1;
                targetLightColor.setHex(0x8888ff);
            }

            window.gameLights.ambient.intensity = THREE.MathUtils.lerp(window.gameLights.ambient.intensity, targetAmbInt, delta);
            window.gameLights.dirLight.intensity = THREE.MathUtils.lerp(window.gameLights.dirLight.intensity, targetDirInt, delta);
            window.gameLights.hemiLight.intensity = THREE.MathUtils.lerp(window.gameLights.hemiLight.intensity, targetHemiInt, delta);
            window.gameLights.dirLight.color.lerp(targetLightColor, delta);
        }

        // Apply physics using dynamic modifier values
        targetGravity = isTripping ? mods.tripGravity : mods.baseGravity;
        currentGravity = THREE.MathUtils.lerp(currentGravity, targetGravity, delta * 2);

        velocity.y -= currentGravity * delta;
        
        // Determine drag based on grounded state
        const drag = isGrounded ? mods.dragGrounded : mods.dragAir;
        velocity.x -= velocity.x * 10 * drag * delta;
        velocity.z -= velocity.z * 10 * drag * delta;

        const fwd = new THREE.Vector3(0, 0, -1).applyEuler(player.rotation);
        const right = new THREE.Vector3(1, 0, 0).applyEuler(player.rotation);

        // Mobile control handling
        if (mobile && mobile.enabled) {
            const m = mobile.update();
            const mobileBaseSpeed = mods.runSpeed + 4; // Mobile boost

            if (m.forward) velocity.add(fwd.clone().multiplyScalar(mobileBaseSpeed * delta * 10 * m.forward));
            if (m.backward) velocity.add(fwd.clone().multiplyScalar(-mobileBaseSpeed * delta * 10 * m.backward));
            if (m.left) velocity.add(right.clone().multiplyScalar(-mobileBaseSpeed * delta * 10 * m.left));
            if (m.right) velocity.add(right.clone().multiplyScalar(mobileBaseSpeed * delta * 10 * m.right));

            if (m.lookDeltaX || m.lookDeltaY) {
                player.rotation.y -= m.lookDeltaX * m.sensitivity;
                cameraPitch -= m.lookDeltaY * m.sensitivity;
                cameraPitch = Math.max(-0.8, Math.min(0.8, cameraPitch));
            }
        }

        // Desktop movement handling
        const isMoving = moveF || moveB || moveL || moveR;
        const currentSpeed = isSprinting ? mods.runSpeed : mods.walkSpeed;

        if (moveF) velocity.add(fwd.clone().multiplyScalar(currentSpeed * delta * 10));
        if (moveB) velocity.add(fwd.clone().multiplyScalar(-currentSpeed * delta * 10));
        if (moveL) velocity.add(right.clone().multiplyScalar(-currentSpeed * delta * 10));
        if (moveR) velocity.add(right.clone().multiplyScalar(currentSpeed * delta * 10));

        player.position.add(velocity.clone().multiplyScalar(delta));

        const currentAnim = modelManager.updateAnimation({
            isMoving: isMoving,
            isGrounded: isGrounded,
            moveB: moveB,
            isSprinting: isSprinting,
            modelFile: selectedModelFile,
            verticalVelocity: velocity.y // <--- VOEG DIT TOE
        });

        // Abyss check
        if (player.position.y < -30) {
            endGame("Je bent in de afgrond gevallen!", false);
        }

        // Ground detection logic
        const rayOrigin = player.position.clone().add(new THREE.Vector3(0, 2.5, 0));
        raycaster.set(rayOrigin, downDirection);
        const intersects = raycaster.intersectObjects(platforms);
        let onSolidGround = false;

        if (intersects.length > 0) {
            const hit = intersects[0];
            if (hit.distance < 4.0 && velocity.y <= 0) {
                player.position.y = hit.point.y + 1.1;
                velocity.y = 0;
                isGrounded = true;
                onSolidGround = true;
            }
        }
        if (!onSolidGround) isGrounded = false;

        // Check for victory condition
        if (player.position.z <= CASTLE_Z + 5 &&
            Math.abs(player.position.x) < 10 &&
            player.position.y <= 12) {
            if (window.gameState !== 'ended') {
                endGame("Je hebt de taart bereikt! GEFELICITEERD!", true);
            }
        }

        // Update progress bar
        const startZ = 0;
        const endZ = CASTLE_Z;
        const progress = Math.max(0, Math.min(100, ((startZ - player.position.z) / (startZ - endZ)) * 100));
        uiManager.updateHUD({ progress: progress }); 

        // Handle collectibles
        for (let i = coins.length - 1; i >= 0; i--) {
            const c = coins[i];
            c.rotation.y += ASSET_CONFIG.COIN_ROTATION_SPEED * delta * .5 ;
            c.position.y = c.baseY + Math.sin(performance.now() * 0.002 + c.bobOffset) * .35 ;
            if (player.position.distanceTo(coins[i].position) < 1.5) {
                const isStar = coins[i].userData.isStar || (coins[i].children && coins[i].children.length > 0);
                scene.remove(coins[i]);
                coins.splice(i, 1);

                if (isStar) {
                    starsCollected++;
                    uiManager.updateHUD({ stars: starsCollected });
                    if (audioManager) audioManager.playSFX('hava');
                } else {
                    coinsCollected++;
                    uiManager.updateHUD({ coins: coinsCollected });
                    if (audioManager) audioManager.playSFX('coin');
                }
                saveUserProgress();
            }
        }

        // Update enemy orientation
        enemies.forEach(e => {
            const targetPos = getNearestPlayerPosition(e.position);
            e.lookAt(targetPos.x, e.position.y, targetPos.z);
        });

        // Check enemy collisions
        for (let i = enemies.length - 1; i >= 0; i--) {
            if (player.position.distanceTo(enemies[i].position) < 2.0) {
                velocity.y = 10; velocity.z += 10;
                if (coinsCollected > 0) {
                    coinsCollected = Math.max(0, coinsCollected - 3);
                    uiManager.updateHUD({ coins: coinsCollected });
                    saveUserProgress();
                } else {
                    endGame("Gepakt door een vijand!", false);
                }
            }
        }

        // Update projectiles
        for (let i = projectiles.length - 1; i >= 0; i--) {
            const p = projectiles[i];
            p.mesh.position.add(p.velocity.clone().multiplyScalar(delta));
            p.life -= delta;

            let hit = false;
            for (let j = enemies.length - 1; j >= 0; j--) {
                if (p.mesh.position.distanceTo(enemies[j].position) < 2.0) {
                    spawnStarAtPosition(enemies[j].position.x,
                        enemies[j].position.y + 1, 
                        enemies[j].position.z, scene, coins);

                    scene.remove(enemies[j]);
                    enemies.splice(j, 1);
                    hit = true;
                    break;
                }
            }

            if (hit || p.life <= 0) {
                scene.remove(p.mesh);
                projectiles.splice(i, 1);
            }
        }

        // Update camera position
        const camOffset = new THREE.Vector3(0, 4, 8); 
        camOffset.applyAxisAngle(new THREE.Vector3(1, 0, 0), cameraPitch);
        camOffset.applyEuler(player.rotation);

        const targetCamPos = player.position.clone().add(camOffset);
        camera.position.lerp(targetCamPos, 0.1);
        camera.lookAt(player.position.clone().add(new THREE.Vector3(0, 2, 0)));

        // Handle interaction prompts
        if (window.ronnie) {
            const dist = player.position.distanceTo(window.ronnie.position);
            const prompt = window.ronnie.children.find(c => c.name === "InteractionPrompt");
            
            if (prompt) {
                prompt.visible = (dist < 5);
                if (prompt.visible) {
                    prompt.position.y = 2.8 + Math.sin(Date.now() * 0.005) * 0.1;
                }
            }
        }

    } 


    renderer.render(scene, camera);
}

function performJump() {
    const mods = settingsManager.get('modifiers');
    const maxJumps = shopSystem ? shopSystem.getMaxJumps() : 1;
    
    if (isGrounded) {
        jumpCount = 0;
    }

    // Infinite Jump Check
    if (mods.infiniteJump || jumpCount < maxJumps) {
        velocity.y = mods.jumpSpeed;
        isGrounded = false;
        jumpCount++;
        if (audioManager) audioManager.playSFX('jump');
    }
}

function performShoot() {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2), new THREE.MeshBasicMaterial({ color: 0x00ffff }));
    ball.position.copy(player.position).add(new THREE.Vector3(0, 1.5, 0));
    scene.add(ball);

    let dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    projectiles.push({ mesh: ball, velocity: dir.multiplyScalar(30), life: 2.0 });

    if (audioManager) audioManager.playSFX('shoot');
}

function setupInputs() {
    // --- 1. UI & Auth Events ---
    uiManager.onLinkAccount(linkAnonymousAccountToEmail);
    uiManager.onLogin(loginWithEmail);
    uiManager.onLogout(logout);

    // Character Selection
    const previews = uiManager.getCharacterPreviewElements();
    previews.forEach(el => {
        modelManager.loadPreviewModel(el, el.dataset.model);
    });

    uiManager.onCharacterSelect((modelPath) => {
        selectedModelFile = modelPath;
        modelManager.dispose();
        if (modelManager.playerModel) {
            player.remove(modelManager.playerModel);
        }
        modelManager.loadPlayerModel(selectedModelFile, player, {
            onProgress: (t, m, c) => uiManager.updateStatus(t, m, c),
            onLoaded: (t, m, c) => uiManager.updateStatus(t, m, c),
            onError: (t, m, c) => uiManager.updateStatus(t, m, c)
        });
    });

    // Game State Events
    uiManager.onStart(async (name) => {
        if (name) myName = name;
        uiManager.startGameUI(myName);

        if (isMultiplayer) {
            const appearance = player.userData.appearance;
            await setDoc(doc(db, "players", userId), {
                name: myName,
                x: player.position.x,
                y: player.position.y,
                z: player.position.z,
                rot: player.rotation.y,
                lastUpdate: Date.now(),
                player_appearance: appearance
            }, { merge: true }).catch(e => {
                console.error("Error sending initial position:", e);
            });
            startBroadcasting(userId, myName, db, auth);
        }

        if (audioManager) {
            audioManager.playMusic('bgm');
        }

        const worldUI = {
            progressBar: uiManager.dom.progressBar,
            progressFill: uiManager.dom.progressFill,
            progressText: uiManager.dom.progressText,
            status: uiManager.dom.authStatus 
        };
        
        await syncAndBuildWorld(scene, worldUI, platforms, coins, enemies, projectiles, isMultiplayer, db, CASTLE_Z, platformTexture, textureLoader);   

        if (!mobile || !mobile.enabled) {
            document.body.requestPointerLock();
        }
        window.gameState = 'playing';
        if (mobile && mobile.enabled) mobile.start();
    });

    uiManager.onPauseToggle((isPaused) => {
        if (isPaused) {
            if (!mobile || !mobile.enabled) {
                document.body.requestPointerLock();
            } else {
                window.gameState = 'playing';
                uiManager.togglePauseScreen(false);
            }
        } else {
            if (document.exitPointerLock) {
                document.exitPointerLock();
            }
            if (!document.pointerLockElement) {
                if (window.gameState === 'playing' && window.gameState !== 'ended') {
                    window.gameState = 'paused';
                    uiManager.togglePauseScreen(true);
                }
            }
        }
    });

    uiManager.onResume(() => {
        if (!mobile || !mobile.enabled) {
            document.body.requestPointerLock();
        } else {
            window.gameState = 'playing';
            uiManager.togglePauseScreen(false);
        }
    });

    uiManager.onRestart(() => window.location.reload());

    uiManager.onFullscreen(() => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable full-screen mode: ${err.message}`);
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    });

    // --- 2. Pointer Lock & Mouse Look ---
    document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement === document.body) {
            window.gameState = 'playing';
            uiManager.togglePauseScreen(false);
        } else {
            if (window.gameState === 'playing' && window.gameState !== 'ended') {
                window.gameState = 'paused';
                uiManager.togglePauseScreen(true);
            }
        }
    });

    document.addEventListener('mousemove', e => {
        if (window.gameState === 'playing') {
            // Haal de sensitivity op uit de settingsManager
            const sens = settingsManager.get('sensitivity') || 1.0;
            const baseSens = 0.002;

            player.rotation.y -= e.movementX * (baseSens * sens);
            cameraPitch -= e.movementY * (baseSens * sens);
            cameraPitch = Math.max(-0.8, Math.min(0.8, cameraPitch));
        }
    });
    
    document.addEventListener('contextmenu', event => event.preventDefault());

    // --- 3. INPUT HANDLERS (Settings Manager) ---
    
    // Settings Button (in Pause Menu)
    const settingsBtn = document.getElementById('settings-btn') || document.querySelector('#pause-screen button:nth-child(2)'); 
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            uiManager.openSettingsMenu(settingsManager, (newAllSettings) => {
                // Sla ALLES op via de manager
                settingsManager.set('audio', newAllSettings.audio);
                settingsManager.set('keybinds', newAllSettings.keybinds);
                settingsManager.set('modifiers', newAllSettings.modifiers);

                // Update Audio
                if (audioManager) {
                    audioManager.updateVolumes(newAllSettings.audio);
                }
                
                // Update Mobile (optioneel)
                // if (mobile) mobile.sensitivity = ... (zit niet in dit menu, kan je toevoegen)
                
                console.log("Settings saved!", newAllSettings);
            });
        });
    }

    // Keyboard Down
    document.addEventListener('keydown', e => {
        if (e.repeat) return; // Voorkomt spammen bij inhouden

        const action = settingsManager.getKeyAction(e.code);
        
        if (action === 'forward') moveF = true;
        if (action === 'backward') moveB = true;
        if (action === 'left') moveL = true;
        if (action === 'right') moveR = true;
        if (action === 'sprint') isSprinting = true;
        if (action === 'jump') performJump();
        
        // INTERACTIE (E) - Praten met Ronnie
        if (action === 'interact') {
            if (window.ronnie && shopSystem) {
                const dist = player.position.distanceTo(window.ronnie.position);
                if (dist < 5) {
                    shopSystem.interactWithRonnie(starsCollected, coinsCollected, (starDelta, coinDelta) => {
                        starsCollected += starDelta;
                        coinsCollected += coinDelta;
                        uiManager.updateHUD({ stars: starsCollected, coins: coinsCollected });
                        saveUserProgress();
                    });
                }
            }
        }
        
        // ABILITY (1) - Cloud Summon
        if (action === 'action1') {
            if (shopSystem && shopSystem.hasCloudAbility()) {
                summonCloudPlatform(player.position, scene, platforms, platformTexture);
            }
        }
    });

    // Keyboard Up
    document.addEventListener('keyup', e => {
        const action = settingsManager.getKeyAction(e.code);
        if (action === 'forward') moveF = false;
        if (action === 'backward') moveB = false;
        if (action === 'left') moveL = false;
        if (action === 'right') moveR = false;
        if (action === 'sprint') isSprinting = false;
    });

    // Muis Acties (Schoongemaakt!)
    document.addEventListener('mousedown', (e) => {
        if (window.gameState !== 'playing') return;
        
        // Linker muisknop (0) = Schieten
        if (e.button === 0) { 
            performShoot(); 
        }

        // Rechter muisknop (2) = Oude Weed Actie
        if (e.button === 2) {
            activateWeed();
        }
    });
}