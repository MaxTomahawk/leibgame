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

let selectedModelFile = 'assets/leib.glb'; // default
let gameVersion = { commit: 'loading...', date: 'loading...' };

// --- PHYSICS & GAMEPLAY SETTINGS ---
const BASE_GRAVITY = 20.0;
const TRIP_GRAVITY = 10.0;
const JUMP_SPEED = 14.0;
const WALK_SPEED = 12.0;
const RUN_SPEED = 18.0;
const CASTLE_Z = -300;
const BUFF_DURATION = 8000;

// --- COLOR CONFIGURATION (Day/Night/Trip) ---
const dayBg = new THREE.Color(0x87CEEB);
const dayFog = new THREE.Color(0x87CEEB);

const nightBg = new THREE.Color(0x020210); // Deep dark blue/black
const nightFog = new THREE.Color(0x050515); // Slightly lighter for depth

const tripFog = new THREE.Color(0x00ff00);
const tripBg = new THREE.Color(0x113311);

// Detect system dark mode preference
const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
let isDarkMode = darkModeQuery.matches;

// Listener for system theme changes
darkModeQuery.addEventListener('change', (e) => {
    isDarkMode = e.matches;
    console.log("Mode changed to:", isDarkMode ? "Night" : "Day");
});

// --- GLOBALS ---
let userId, myName = "Player", isMultiplayer = false;
let camera, scene, renderer, player = {};
let modelManager = new ModelManager();
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

const raycaster = new THREE.Raycaster();
const downDirection = new THREE.Vector3(0, -1, 0);

// Trip Mode Variables
let isTripping = false;
let tripTimer = null;
let currentGravity = BASE_GRAVITY;
let targetGravity = BASE_GRAVITY;

const ui = {
    start: document.getElementById('start-screen'),
    status: document.getElementById('auth-status'),
    btn: document.getElementById('start-btn'),
    mobileMenuBtn: document.getElementById('mobile-menu-btn'),
    resumeBtn: document.getElementById('resume-btn'),
    fullscreenBtn: document.getElementById('fullscreen-btn'),
    pauseScreen: document.getElementById('pause-screen'),
    coins: document.getElementById('coin-display'),
    stars: document.getElementById('star-display'),
    peers: document.getElementById('peer-count'),
    nameDisplay: document.getElementById('player-name-display'),
    nameInput: document.getElementById('username-input'),
    gameOver: document.getElementById('game-over-screen'),
    goReason: document.getElementById('go-reason'),
    progressBar: document.getElementById('progress-bar'),
    progressFill: document.getElementById('progress-fill'),
    progressText: document.getElementById('progress-text'),
    version: document.getElementById('version-display')
};

// Fetch version on load
fetch('version.json')
    .then(r => r.json())
    .then(v => {
        gameVersion = v;
        console.log('Game Version:', v.commit, '|', v.date);
        updateVersionDisplay();
    })
    .catch(e => {
        console.warn('Could not load version:', e);
        gameVersion = { commit: 'dev', date: 'local' };
        updateVersionDisplay();
    });

function updateVersionDisplay() {
    const versionEl = document.getElementById('version-display');
    if (versionEl) {
        versionEl.innerText = `v${gameVersion.commit}`;
        versionEl.title = `Built: ${gameVersion.date}`;
    }
}

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
    // Start Three.js first to provide visual feedback
    initThreeJS();
    mobile = new MobileControls();
    handleMobileControls(mobile);

    const hintEl = document.getElementById('controls-hint');
    if (hintEl) {
        if (mobile.enabled) {
            // Instructions for Mobile
            hintEl.innerHTML = `
                <p><strong>Mobile Controls:</strong></p>
                <ul class="list-disc pl-4 mt-1">
                    <li>🕹️ <strong>Left Side:</strong> Joystick (Move)</li>
                    <li>👆 <strong>Right Side:</strong> Drag to look</li>
                    <li>⚡ <strong>Double Tap (Right):</strong> Jump</li>
                    <li>💥 <strong>Button:</strong> Spit</li>
                    <li>🍃 <strong>Button:</strong> Smoke</li>
                </ul>`;
        } else {
            // Instructions for PC
            hintEl.innerHTML = `
                <p><strong>PC Controls:</strong></p>
                <p>WASD (Move) | Space (Jump) | Mouse (Look) | Shift (Run) | LMB (Spit) | RMB (Smoke)</p>`;
        }
    }

    try {
        updateStatus("firebase", "🔌 Connecting...", "blue");

        const firebaseGlobals = initFirebase((user) => {
            userId = user.uid;
            isMultiplayer = true;
            console.log("Firebase connected! User ID:", userId);
            updateStatus("firebase", "✅ Multiplayer connected!", "green");

            // Load saved progress if available
            const userRef = doc(db, "users", userId);
            getDoc(userRef).then((snap) => {
                if (snap.exists()) {
                    const data = snap.data();
                    coinsCollected = data.coins || 0;
                    starsCollected = data.stars || 0;
                    
                    // Update UI
                    ui.coins.innerText = coinsCollected;
                    ui.stars.innerText = starsCollected;
                    console.log("Progress loaded from database.");
                }
            });

            checkIfReadyToStart();
            listenToPlayers(scene, userId, ui, db);
        });
    } catch (e) {
        console.error("Firebase init error:", e);
        updateStatus("firebase", "⚠️ Offline Mode (Config Error)", "yellow");
        isMultiplayer = false;
        checkIfReadyToStart();
    }
};

function checkIfReadyToStart() {
    console.log("Ready check: modelLoaded =", modelLoaded, ", isMultiplayer =", isMultiplayer, ", userId =", userId);
    if (modelLoaded && (!isMultiplayer || (isMultiplayer && userId))) {
        enableStart();
    }
}

function enableStart() {
    ui.btn.disabled = false;
    ui.btn.classList.remove('opacity-50', 'cursor-not-allowed');
}

function createSkyAtmosphere(scene) {
    // 1. DISTANT GROUND/HORIZON
    const groundGeo = new THREE.PlaneGeometry(2000, 2000);
    const groundMat = new THREE.MeshLambertMaterial({
        color: 0x3a5f3a,
        fog: true
    });
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
                color: new THREE.Color().setHSL(
                    0.28 + Math.random() * 0.12,
                    0.15 + Math.random() * 0.2,
                    0.2 + Math.random() * 0.2
                ),
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
        const bodyMat = new THREE.MeshStandardMaterial({
            color: 0x888888,
            metalness: 0.7,
            roughness: 0.3
        });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        ufoGroup.add(body);

        const domeGeo = new THREE.SphereGeometry(0.75, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2);
        const domeMat = new THREE.MeshStandardMaterial({
            color: 0x00ffcc,
            transparent: true,
            opacity: 0.6,
            metalness: 0.2,
            roughness: 0.1
        });
        const dome = new THREE.Mesh(domeGeo, domeMat);
        dome.position.y = 0.3;
        ufoGroup.add(dome);

        const ringGeo = new THREE.TorusGeometry(2.5, 0.1, 16, 100);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0x00ffcc,
            transparent: true,
            opacity: 0.4,
            side: THREE.DoubleSide
        });
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
            startX: startX,
            startY: startY,
            startZ: startZ
        });
    }

    // 4. SPEED PARTICLES
    const particles = [];
    for (let i = 0; i < 2500; i++) {
        const particleGeo = new THREE.SphereGeometry(0.12, 6, 6);
        const particleMat = new THREE.MeshBasicMaterial({
            color: new THREE.Color().setHSL(Math.random(), 1.0, 0.6),
            transparent: true,
            opacity: 0.9,
            blending: THREE.NormalBlending
        });

        const particle = new THREE.Mesh(particleGeo, particleMat);

        particle.position.x = (Math.random() - 0.5) * 300;
        particle.position.y = -10 + Math.random() * 80;
        particle.position.z = (Math.random() - 0.5) * 300;

        particle.rotation.x = (Math.random() - 0.5) * 0.3;
        particle.rotation.y = (Math.random() - 0.5) * 0.3;

        scene.add(particle);
        particles.push({
            mesh: particle,
            speed: 6 + Math.random() * 55,
            hueOffset: Math.random() * Math.PI * 2
        });
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
                const baseScale = 1.0;
                ring.scale.set(baseScale * (0.8 + pulse * 0.6), baseScale * (0.8 + pulse * 0.6), 1);
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
    
    // Set initial background based on current mode
    scene.background = isDarkMode ? nightBg.clone() : dayBg.clone();
    scene.fog = new THREE.Fog(isDarkMode ? nightFog.clone() : dayFog.clone(), 10, 90);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // --- LIGHTING SETUP (Modified for Day/Night cycle) ---
    const ambient = new THREE.AmbientLight(0xffffff, 0.25);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.3);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    // Save references to global scope to allow animation
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

    modelManager.loadPlayerModel(selectedModelFile, player, {
        onProgress: updateStatus,
        onLoaded: (type, msg, color) => {
            updateStatus(type, msg, color);
            modelLoaded = true;
            checkIfReadyToStart();
        },
        onError: (type, msg, color) => {
            updateStatus(type, msg, color);
            modelLoaded = true;
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

const statusMessages = { model: "", firebase: "" };

function updateStatus(type, message, color) {
    statusMessages[type] = { text: message, color: color };
    const messages = [];
    const colors = [];

    if (statusMessages.model.text) {
        messages.push(statusMessages.model.text);
        colors.push(statusMessages.model.color);
    }
    if (statusMessages.firebase.text) {
        messages.push(statusMessages.firebase.text);
        colors.push(statusMessages.firebase.color);
    }

    const colorPriority = { red: 1, yellow: 2, purple: 3, blue: 4, green: 5 };
    const finalColor = colors.sort((a, b) => colorPriority[a] - colorPriority[b])[0] || "blue";

    const colorClasses = {
        red: "bg-red-100 text-red-800 border-red-400",
        yellow: "bg-yellow-100 text-yellow-800 border-yellow-400",
        purple: "bg-purple-100 text-purple-800 border-purple-400",
        blue: "bg-blue-100 text-blue-800 border-blue-400",
        green: "bg-green-100 text-green-800 border-green-400"
    };

    ui.status.innerHTML = messages.join("<br>");
    ui.status.className = `text-sm p-3 mb-4 rounded-lg border ${colorClasses[finalColor]}`;
}

// --- GAMEPLAY FUNCTIONS ---
function activateWeed() {
    if (window.gameState !== 'playing' || coinsCollected < 1 || isTripping) return;
    coinsCollected--;
    ui.coins.innerText = coinsCollected;
    
    // Save progress after spending a coin
    saveUserProgress();

    isTripping = true;
    document.body.classList.add('tripping');
    targetGravity = TRIP_GRAVITY;

    clearTimeout(tripTimer);
    tripTimer = setTimeout(() => {
        isTripping = false;
        document.body.classList.remove('tripping');
        targetGravity = BASE_GRAVITY;
    }, BUFF_DURATION);
}

function endGame(reason, won = false) {
    window.gameState = 'ended';
    document.exitPointerLock();
    ui.goReason.innerText = reason;
    ui.goReason.style.color = won ? '#00ff00' : '#ff0000';
    ui.gameOver.classList.add('active');

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

// Helper for nearest player
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
        // 1. DETERMINE TARGET COLORS
        // If tripping, ignore day/night. Otherwise, check isDarkMode.
        let targetBg = isTripping ? tripBg : (isDarkMode ? nightBg : dayBg);
        let targetFog = isTripping ? tripFog : (isDarkMode ? nightFog : dayFog);

        // Lerp background and fog colors
        scene.background.lerp(targetBg, delta * 2.0);
        scene.fog.color.lerp(targetFog, delta * 2.0);

        // 2. ADJUST LIGHTING (Realistic Night vs Day)
        if (window.gameLights) {
            // Day defaults
            let targetAmbInt = 0.25;
            let targetDirInt = 0.6;
            let targetHemiInt = 0.3;
            let targetLightColor = new THREE.Color(0xffffff); // White sunlight

            // Night overrides
            if (isDarkMode && !isTripping) {
                targetAmbInt = 0.05;      // Very dark ambient
                targetDirInt = 0.2;       // Dim moonlight
                targetHemiInt = 0.1;      // Barely any environmental light
                targetLightColor.setHex(0x8888ff); // Cool blue moonlight
            }

            // Smoothly transition intensity
            window.gameLights.ambient.intensity = THREE.MathUtils.lerp(window.gameLights.ambient.intensity, targetAmbInt, delta);
            window.gameLights.dirLight.intensity = THREE.MathUtils.lerp(window.gameLights.dirLight.intensity, targetDirInt, delta);
            window.gameLights.hemiLight.intensity = THREE.MathUtils.lerp(window.gameLights.hemiLight.intensity, targetHemiInt, delta);
            
            // Smoothly transition light color
            window.gameLights.dirLight.color.lerp(targetLightColor, delta);
        }

        currentGravity = THREE.MathUtils.lerp(currentGravity, targetGravity, delta * 2);

        velocity.y -= currentGravity * delta;
        const drag = isGrounded ? 3.0 : 1.8;
        velocity.x -= velocity.x * 10 * drag * delta;
        velocity.z -= velocity.z * 10 * drag * delta;

        const fwd = new THREE.Vector3(0, 0, -1).applyEuler(player.rotation);
        const right = new THREE.Vector3(1, 0, 0).applyEuler(player.rotation);

        if (mobile && mobile.enabled) {
            const m = mobile.update();
            const mobileBaseSpeed = RUN_SPEED + 4;

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

        const isMoving = moveF || moveB || moveL || moveR;
        const currentSpeed = isSprinting ? RUN_SPEED : WALK_SPEED;

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
            modelFile: selectedModelFile
        });

        if (player.position.y < -30) {
            endGame("Je bent in de afgrond gevallen!", false);
        }

        // Raycasting
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

        // WIN CHECK
        if (player.position.z <= CASTLE_Z + 5 &&
            Math.abs(player.position.x) < 10 &&
            player.position.y <= 12) {
            if (window.gameState !== 'ended') {
                endGame("Je hebt de taart bereikt! GEFELICITEERD!", true);
            }
        }

        const startZ = 0;
        const endZ = CASTLE_Z;
        const progress = Math.max(0, Math.min(100, ((startZ - player.position.z) / (startZ - endZ)) * 100));
        ui.progressFill.style.width = progress + '%';
        ui.progressText.innerText = Math.round(progress) + '%';

        for (let i = coins.length - 1; i >= 0; i--) {
            coins[i].rotation.y += ASSET_CONFIG.COIN_ROTATION_SPEED * delta;
            if (player.position.distanceTo(coins[i].position) < 1.5) {
                const isStar = coins[i].userData.isStar || (coins[i].children && coins[i].children.length > 0);
                scene.remove(coins[i]);
                coins.splice(i, 1);

                if (isStar) {
                    starsCollected++;
                    ui.stars.innerText = starsCollected;
                    if (audioManager) audioManager.playSFX('hava');
                } else {
                    coinsCollected++;
                    ui.coins.innerText = coinsCollected;
                    if (audioManager) audioManager.playSFX('coin');
                }
                
                // Save progress
                saveUserProgress();
            }
        }

        enemies.forEach(e => {
            const targetPos = getNearestPlayerPosition(e.position);
            e.lookAt(targetPos.x, e.position.y, targetPos.z);
        });

        // --- BILLBOARD UPDATE LOGIC ---
        if (window.castle) {
            const billboard = window.castle.getObjectByName('TaartBillboard');
            if (billboard) {
                billboard.lookAt(camera.position); 
            }
        }

        for (let i = enemies.length - 1; i >= 0; i--) {
            if (player.position.distanceTo(enemies[i].position) < 2.0) {
                velocity.y = 10; velocity.z += 10;
                if (coinsCollected > 0) {
                    coinsCollected = Math.max(0, coinsCollected - 3);
                    ui.coins.innerText = coinsCollected;
                    saveUserProgress(); // Save loss
                } else {
                    endGame("Gepakt door een vijand!", false);
                }
            }
        }

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

        const camOffset = new THREE.Vector3(0, 4, 8); 
        camOffset.applyAxisAngle(new THREE.Vector3(1, 0, 0), cameraPitch);
        camOffset.applyEuler(player.rotation);

        const targetCamPos = player.position.clone().add(camOffset);
        camera.position.lerp(targetCamPos, 0.1);
        camera.lookAt(player.position.clone().add(new THREE.Vector3(0, 2, 0)));
    }

    renderer.render(scene, camera);
}

// Action: Jump
function performJump() {
    velocity.y = JUMP_SPEED;
    isGrounded = false;
    if (audioManager) audioManager.playSFX('jump');
}

// Action: Shoot
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
    // UI Event Listeners for Authentication
    const loginBtn = document.getElementById('show-login-btn');
    const loginContainer = document.getElementById('login-form-container');
    const linkBtn = document.getElementById('btn-link-account');
    const signInBtn = document.getElementById('btn-login');
    const logoutBtn = document.getElementById('btn-logout');
    const authError = document.getElementById('auth-error');

    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            if (loginContainer) loginContainer.classList.toggle('hidden');
        });
    }

    if (linkBtn) {
        linkBtn.addEventListener('click', async () => {
            const email = document.getElementById('email-input').value;
            const pass = document.getElementById('password-input').value;
            try {
                authError.innerText = "Linking...";
                await linkAnonymousAccountToEmail(email, pass);
                authError.innerText = "Success! Progress Saved.";
                authError.className = "text-green-500 text-xs mt-2 font-bold";
            } catch (err) {
                authError.className = "text-red-500 text-xs mt-2 font-bold";
                authError.innerText = err.message;
            }
        });
    }

    if (signInBtn) {
        signInBtn.addEventListener('click', async () => {
            const email = document.getElementById('email-input').value;
            const pass = document.getElementById('password-input').value;
            try {
                authError.innerText = "Logging in...";
                await loginWithEmail(email, pass);
                authError.innerText = "Welcome back!";
                authError.className = "text-green-500 text-xs mt-2 font-bold";
                window.location.reload(); 
            } catch (err) {
                authError.className = "text-red-500 text-xs mt-2 font-bold";
                authError.innerText = err.message;
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await logout();
        });
    }

    const charButtons = document.querySelectorAll('.char-btn');
    charButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            selectedModelFile = btn.dataset.model;
            modelManager.dispose();
            if (modelManager.playerModel) {
                player.remove(modelManager.playerModel);
            }
            modelManager.loadPlayerModel(selectedModelFile, player, {
                onProgress: updateStatus,
                onLoaded: updateStatus,
                onError: updateStatus
            });
            charButtons.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        });
    });
    ui.btn.addEventListener('click', async () => {
        const inputName = ui.nameInput.value.trim();
        if (inputName) myName = inputName;
        ui.nameDisplay.innerText = myName;

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

        await syncAndBuildWorld(scene, ui, platforms, coins, enemies, projectiles, isMultiplayer, db, CASTLE_Z, platformTexture, textureLoader);

        ui.start.classList.remove('active');
        ui.progressBar.style.display = 'block';
        if (!mobile || !mobile.enabled) {
            document.body.requestPointerLock();
        }
        window.gameState = 'playing';

        if (mobile && mobile.enabled) mobile.start();
    });

    ui.mobileMenuBtn.addEventListener('click', () => {
        const isPaused = ui.pauseScreen.classList.contains('active');
        if (isPaused) {
            if (!mobile || !mobile.enabled) {
                document.body.requestPointerLock();
            } else {
                window.gameState = 'playing';
                ui.pauseScreen.classList.remove('active');
            }
        } else {
            if (document.exitPointerLock) {
                document.exitPointerLock();
            }
            if (!document.pointerLockElement) {
                if (window.gameState === 'playing' && window.gameState !== 'ended') {
                    window.gameState = 'paused';
                    ui.pauseScreen.classList.add('active');
                }
            }
        }
    });

    ui.resumeBtn.addEventListener('click', () => {
        if (!mobile || !mobile.enabled) {
            document.body.requestPointerLock();
        } else {
            window.gameState = 'playing';
            ui.pauseScreen.classList.remove('active');
        }
    });

    ui.fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    });

    document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement === document.body) {
            window.gameState = 'playing';
            ui.pauseScreen.classList.remove('active');
        } else {
            if (window.gameState === 'playing' && window.gameState !== 'ended') {
                window.gameState = 'paused';
                ui.pauseScreen.classList.add('active');
            }
        }
    });

    document.addEventListener('keydown', e => {
        if (e.code === 'KeyW') moveF = true;
        if (e.code === 'KeyS') moveB = true;
        if (e.code === 'KeyA') moveL = true;
        if (e.code === 'KeyD') moveR = true;
        if (e.code === 'ShiftLeft') isSprinting = true;
        if (e.code === 'Space') {
            performJump();
        }
    });
    document.addEventListener('keyup', e => {
        if (e.code === 'KeyW') moveF = false;
        if (e.code === 'KeyS') moveB = false;
        if (e.code === 'KeyA') moveL = false;
        if (e.code === 'KeyD') moveR = false;
        if (e.code === 'ShiftLeft') isSprinting = false;
    });
    document.addEventListener('mousemove', e => {
        if (window.gameState === 'playing') {
            player.rotation.y -= e.movementX * 0.002;
            cameraPitch -= e.movementY * 0.002;
            cameraPitch = Math.max(-0.8, Math.min(0.8, cameraPitch));
        }

    });
    document.addEventListener('contextmenu', event => event.preventDefault());

    document.addEventListener('mousedown', (e) => {
        if (window.gameState !== 'playing') return;

        switch (e.button) {
            case 0: 
                performShoot();
                break;

            case 2: 
                activateWeed();
                break;
        }
    });
    document.querySelectorAll('.char-preview').forEach(el => {
        el.addEventListener('click', () => {
            selectedModelFile = el.dataset.model;

            modelManager.dispose();
            if (modelManager.playerModel) {
                player.remove(modelManager.playerModel);
            }

            modelManager.loadPlayerModel(selectedModelFile, player, {
                onProgress: updateStatus,
                onLoaded: updateStatus,
                onError: updateStatus
            });

            document.querySelectorAll('.char-preview').forEach(e => e.classList.remove('selected'));
            el.classList.add('selected');
        });
    });

    document.querySelectorAll('.char-preview').forEach(el => {
        modelManager.loadPreviewModel(el, el.dataset.model);
    });
}
