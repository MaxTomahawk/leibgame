import * as THREE from 'three';
import { syncAndBuildWorld, generateWorldData, ASSET_CONFIG, spawnStarAtPosition } from './world.js';
import { MobileControls } from './mobile-controls.js';
import { AudioManager } from './audio-manager.js';
import { ModelManager } from './model-manager.js';
import { UIManager } from './ui-manager.js';
import { ShopSystem } from './shop-system.js';
import { SettingsManager } from './settings-manager.js';
import { loadRonnie, summonCloudPlatform } from './world.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/GLTFLoader.js';
import { WeatherSystem } from './weather.js';


// ===== FEATURE FLAGS =====
const FEATURES = {
    MULTIPLAYER: false,  // Set to false to disable all multiplayer
    SHOP_ONLINE: false   // Set to false for offline shop (localStorage)
};

// ===== CONDITIONAL IMPORTS =====
let firebaseModule = null;
let multiplayerModule = null;
let db = null;
let auth = null;

// Only load multiplayer if enabled
async function loadMultiplayerModules() {
    if (!FEATURES.MULTIPLAYER) return;

    try {
        const [firebase, multiplayer] = await Promise.all([
            import('./firebase.js'),
            import('./multiplayer.js')
        ]);
        firebaseModule = firebase;
        multiplayerModule = multiplayer;
        db = firebase.db;
        auth = firebase.auth;
        console.log("✅ Multiplayer modules loaded");
    } catch (e) {
        console.warn('⚠️ Failed to load multiplayer modules:', e);
        FEATURES.MULTIPLAYER = false;
    }
}


let selectedModelFile = 'assets/leib.glb'; // default
let gameVersion = { commit: 'loading...', date: 'loading...' };

// --- PHYSICS & GAMEPLAY SETTINGS ---
const CASTLE_Z = -300;
const BUFF_DURATION = 8000;

// --- COLOR CONFIGURATION (Day/Night/Trip) ---
const COLORS = {
    day: {
        bg: new THREE.Color(0x87CEEB),
        fog: new THREE.Color(0x87CEEB)
    },
    night: {
        bg: new THREE.Color(0x020210),
        fog: new THREE.Color(0x050515)
    },
    trip: {
        bg: new THREE.Color(0x113311),
        fog: new THREE.Color(0x00ff00)
    }
};

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
let isGliding = false;
let weatherSystem;

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
        if (uiManager) uiManager.setVersion(v.commit, v.date);
    })
    .catch(e => {
        console.warn('Could not load version:', e);
        gameVersion = { commit: 'dev', date: 'local' };
        if (uiManager) uiManager.setVersion('dev', 'local');
    });

function handleMobileControls(mobile) {
    mobile.onJump = () => performJump();
    mobile.onShoot = () => performShoot();
    mobile.onAbility = () => activateWeed();
}

async function saveUserProgress() {
    const data = {
        coins: coinsCollected,
        stars: starsCollected,
        lastSaved: Date.now()
    };

    // Try Firebase first if available
    if (FEATURES.MULTIPLAYER && auth?.currentUser && db) {
        try {
            const { setDoc, doc } = await import("https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js");
            const userRef = doc(db, "users", auth.currentUser.uid);
            await setDoc(userRef, data, { merge: true });
            console.log("✅ Progress saved to Firebase");
            return;
        } catch (e) {
            console.warn("⚠️ Firebase save failed:", e);
        }
    }

    // Fallback to localStorage
    localStorage.setItem('gameProgress', JSON.stringify(data));
    console.log("💾 Progress saved locally");
}

async function loadUserProgress() {
    // Try Firebase first
    if (FEATURES.MULTIPLAYER && auth?.currentUser && db) {
        try {
            const { getDoc, doc } = await import("https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js");
            const userRef = doc(db, "users", auth.currentUser.uid);
            const snap = await getDoc(userRef);
            if (snap.exists()) {
                const data = snap.data();
                coinsCollected = data.coins || 0;
                starsCollected = data.stars || 0;
                console.log("✅ Progress loaded from Firebase");
                return;
            }
        } catch (e) {
            console.warn("⚠️ Firebase load failed:", e);
        }
    }

    // Fallback to localStorage
    const saved = localStorage.getItem('gameProgress');
    if (saved) {
        const data = JSON.parse(saved);
        coinsCollected = data.coins || 0;
        starsCollected = data.stars || 0;
        console.log("💾 Progress loaded locally");
    }
}


window.onload = async () => {
    uiManager = new UIManager();
    settingsManager = new SettingsManager();
    uiManager.setVersion(gameVersion.commit, gameVersion.date);

    // Setup weather system
    const weatherSetting = settingsManager.get('weather');
    uiManager.setupThemeToggle(settingsManager, (themeVal) => {
        if (!weatherSystem) return;

        if (themeVal === 'auto') {
            weatherSystem.setMode('dynamic');
        } else {
            weatherSystem.setMode('static');
            const weatherType = (themeVal === 'dark') ? 'night' : 'day'; 
            weatherSystem.setWeather(weatherType);
        }
    });

    initThreeJS();
    mobile = new MobileControls();
    handleMobileControls(mobile);
    uiManager.setControlsHint(mobile.enabled);

    // Load multiplayer modules first
    await loadMultiplayerModules();

    // ===== MULTIPLAYER INITIALIZATION (OPTIONAL) =====
    if (FEATURES.MULTIPLAYER && firebaseModule) {
        try {
            uiManager.updateStatus("firebase", "🔌 Connecting...", "blue");

            firebaseModule.initFirebase(async (user) => {
                userId = user.uid;
                isMultiplayer = true;
                console.log("✅ Firebase connected!");
                uiManager.updateStatus("firebase", "✅ Multiplayer!", "green");

                // Initialize shop with Firebase
                if (FEATURES.SHOP_ONLINE) {
                    shopSystem = new ShopSystem(uiManager, db, auth);
                    await shopSystem.syncUserData(userId);
                }

                await loadUserProgress();
                uiManager.initHUD(coinsCollected, starsCollected);
                checkIfReadyToStart();

                // Start multiplayer listeners
                if (multiplayerModule) {
                    multiplayerModule.listenToPlayers(scene, userId, { peers: uiManager.dom.peerCount }, db);
                }
            });
        } catch (e) {
            console.error("❌ Firebase error:", e);
            uiManager.updateStatus("firebase", "⚠️ Offline", "yellow");
            initOfflineMode();
        }
    } else {
        initOfflineMode();
    }
};

// ===== NEW: OFFLINE MODE INITIALIZATION =====
async function initOfflineMode() {
    console.log("🎮 OFFLINE MODE");
    isMultiplayer = false;

    // Initialize offline shop
    shopSystem = new ShopSystem(uiManager, null, null);

    await loadUserProgress();
    uiManager.initHUD(coinsCollected, starsCollected);
    uiManager.updateStatus("firebase", "🎮 Offline", "gray");

    checkIfReadyToStart();
}


function checkIfReadyToStart() {
    if (modelLoaded) {
        uiManager.enableStartButton();
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

    let weatherSetting = settingsManager.get('weather');
    let initialWeather = (weatherSetting === 'dynamic' || weatherSetting === 'day') ? 'day' : 'night';
    scene.background = COLORS[initialWeather].bg.clone();
    scene.fog = new THREE.Fog(COLORS[initialWeather].fog.clone(), 10, 90);

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

    weatherSystem = new WeatherSystem(scene);
    weatherSetting = settingsManager.get('weather');
    if (weatherSetting === 'dynamic') {
        weatherSystem.setMode('dynamic');
    } else {
        weatherSystem.setMode('static');
        weatherSystem.setWeather(weatherSetting);
    }

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
    uiManager.showGameOver(reason, won);

    // Only regenerate if multiplayer is active
    if (won && FEATURES.MULTIPLAYER && db) {
        console.log("🏆 Regenerating world...");
        regenerateWorld();
    }
}

async function regenerateWorld() {
    if (!FEATURES.MULTIPLAYER || !db) return;

    try {
        const { setDoc, doc } = await import("https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js");
        const worldData = generateWorldData(CASTLE_Z);
        await setDoc(doc(db, "levels", "main_world"), worldData);
        console.log("✅ World regenerated!");
    } catch (e) {
        console.error("❌ Failed:", e);
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

function animate() {
    requestAnimationFrame(animate);
    const now = Date.now();
    const delta = 0.016;

    // Retrieve active modifiers from SettingsManager
    const mods = settingsManager.get('modifiers');

    // Update weather system
    if (weatherSystem) {
        weatherSystem.update(delta, isTripping);
    }

    modelManager.update(delta);

    if (FEATURES.MULTIPLAYER && multiplayerModule) {
        multiplayerModule.updateOtherPlayerAnimations(delta);
    }

    enemies.forEach(e => {
        if (e.userData.mixer) {
            e.userData.mixer.update(delta);
        }
    });

    if (window.gameState === 'playing') {
        const currentWeather = weatherSystem.getCurrentWeather();
        const weatherType = currentWeather === 'night' ? 'night' : 'day';
        let targetBg = isTripping ? COLORS.trip.bg : COLORS[weatherType].bg;
        let targetFog = isTripping ? COLORS.trip.fog : COLORS[weatherType].fog;

        scene.background.lerp(targetBg, delta * 2.0);
        scene.fog.color.lerp(targetFog, delta * 2.0);

        if (window.gameLights) {
            let targetAmbInt = 0.25;
            let targetDirInt = 0.6;
            let targetHemiInt = 0.3;
            let targetLightColor = new THREE.Color(0xffffff);

            if (weatherType === 'night' && !isTripping) {
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

        let currentDrag;
        // Determine drag based on grounded state
        if (isGrounded) {
            currentDrag = mods.dragGrounded;
        } else if (isGliding) {
            currentDrag = 0.8; // <--- VEEL lager dan mods.dragAir (normaal ~1.8)
            // Je glijdt nu veel verder door!
        } else {
            currentDrag = mods.dragAir;
        }
        velocity.x -= velocity.x * 10 * currentDrag * delta;
        velocity.z -= velocity.z * 10 * currentDrag * delta;

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

        const localVelocity = velocity.clone();
        localVelocity.applyEuler(new THREE.Euler(0, -player.rotation.y, 0));
        // Nu is localVelocity.z = vooruit, localVelocity.x = opzij

        const currentAnim = modelManager.updateAnimation({
            isMoving: isMoving,
            isGrounded: isGrounded,
            moveB: moveB,
            isSprinting: isSprinting,
            modelFile: selectedModelFile,
            verticalVelocity: velocity.y,
            isGliding: isGliding,
            localVelocity: localVelocity
        });

        if (player) {
            player.userData.currentAnimation = currentAnim;
        }

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
            c.rotation.y += ASSET_CONFIG.COIN_ROTATION_SPEED * delta * .5;
            c.position.y = c.baseY + Math.sin(performance.now() * 0.002 + c.bobOffset) * .35;
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

        // 1. Check Glide condities in elke frame
        if (isGrounded || jumpCount > shopSystem.getMaxJumps()) {
            // Als je landt of springt terwijl je glidet, stopt glide
            isGliding = false;
        }

        // 2. Physics aanpassen
        targetGravity = isTripping ? mods.tripGravity : mods.baseGravity;

        // OVERRIDE als we gliden
        if (isGliding) {
            targetGravity = 8.0; // Verlaagde zwaartekracht
            // Optioneel: rem de valsnelheid direct af als je begint met gliden
            if (velocity.y < -2) velocity.y = THREE.MathUtils.lerp(velocity.y, -2, delta * 5);
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
        isGliding = false;
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
    if (FEATURES.MULTIPLAYER && firebaseModule) {
        uiManager.onLinkAccount(firebaseModule.linkAnonymousAccountToEmail);
        uiManager.onLogin(firebaseModule.loginWithEmail);
        uiManager.onLogout(firebaseModule.logout);
    } else {
        // Offline mode - disable auth buttons
        uiManager.onLinkAccount(() => console.log('Auth disabled in offline mode'));
        uiManager.onLogin(() => console.log('Auth disabled in offline mode'));
        uiManager.onLogout(() => console.log('Auth disabled in offline mode'));
    }

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

        if (FEATURES.MULTIPLAYER && firebaseModule && db) {
            try {
                const { setDoc, doc } = await import("https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js");
                const appearance = player.userData.appearance;
                await setDoc(doc(db, "players", userId), {
                    name: myName,
                    x: player.position.x,
                    y: player.position.y,
                    z: player.position.z,
                    rot: player.rotation.y,
                    lastUpdate: Date.now(),
                    player_appearance: appearance
                }, { merge: true });
                multiplayerModule.startBroadcasting(userId, myName, db, auth);
                console.log("✅ Multiplayer broadcasting started");
            } catch (e) {
                console.error("❌ Multiplayer start failed:", e);
            }
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
                settingsManager.set('graphics', newAllSettings.graphics);

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
        if (action === 'cloud') {
            if (shopSystem && shopSystem.hasCloudAbility()) {
                summonCloudPlatform(player.position, scene, platforms, platformTexture);
            }
        }

        if (action === 'glide') {
            // Mag alleen als: Ronnie shop item gekocht is, we in de lucht zijn, en niet aan het vallen in de 'afgrond' (optioneel)
            if (shopSystem && shopSystem.hasGlideAbility() && !isGrounded) {
                isGliding = !isGliding;
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