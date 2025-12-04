import * as THREE from 'three';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/GLTFLoader.js';
import { initFirebase, db, auth } from './firebase.js';
import { listenToPlayers, startBroadcasting, updateOtherPlayerAnimations } from './multiplayer.js';
import { getDoc, setDoc, doc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { syncAndBuildWorld, generateWorldData, ASSET_CONFIG, spawnStarAtPosition } from './world.js';
import { MobileControls } from './mobile-controls.js';
import { AudioManager } from './audio-manager.js';

let selectedModelFile = 'assets/leib.glb'; // default
let gameVersion = { commit: 'loading...', date: 'loading...' };


// Settings (unchanged)
const BASE_GRAVITY = 20.0;
const TRIP_GRAVITY = 10.0;
const JUMP_SPEED = 14.0;
const WALK_SPEED = 12.0;
const RUN_SPEED = 18.0;
const CASTLE_Z = -300;
const BUFF_DURATION = 8000;

// Globals (unchanged)
let userId, myName = "Player", isMultiplayer = false;
let camera, scene, renderer, player, playerModel, mixer, animations = {};
let velocity = new THREE.Vector3();
let platforms = [], coins = [], enemies = [], otherPlayers = {}, projectiles = [];
window.gameState = 'start';
let coinsCollected = 0;
let starsCollected = 0;
let moveF = false, moveB = false, moveL = false, moveR = false;
let isSprinting = false;
let cameraPitch = 0;
let textureLoader;
let currentAction = null;
let modelLoaded = false;
let platformTexture = null;
let mobile = null // mobile support
let audioManager;

const raycaster = new THREE.Raycaster();
const downDirection = new THREE.Vector3(0, -1, 0);

const MODEL_SCALES = {
    'assets/option2.glb': 0.45,
    'assets/medieval_luuk.glb': 1.3,
    'assets/leib.glb': 1.3,
};

// Trip Mode Variables (unchanged)
let isTripping = false;
let tripTimer = null;
let currentGravity = BASE_GRAVITY;
let targetGravity = BASE_GRAVITY;
const baseFog = new THREE.Color(0x87CEEB);
const tripFog = new THREE.Color(0x00ff00);
const baseBg = new THREE.Color(0x87CEEB);
const tripBg = new THREE.Color(0x113311);

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

// ... (Rest of helper functions like updateVersionDisplay, handleMobileControls, window.onload, etc. are unchanged) ...


// ✅ NEW: Fetch version on load (unchanged)
fetch('version.json')
    .then(r => r.json())
    .then(v => {
        gameVersion = v;
        console.log('🎮 Game Version:', v.commit, '|', v.date);
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

    mobile.onAbility = () => {
        activateWeed();
    };
}

window.onload = async () => {
    // Start Three.js first to provide visual feedback
    initThreeJS();
    mobile = new MobileControls();
    handleMobileControls(mobile)

    const hintEl = document.getElementById('controls-hint');
    if (hintEl) {
        if (mobile.enabled) {
            // Instructies voor Mobiel (gebaseerd op je mobile-controls.js logica)
            hintEl.innerHTML = `
                <p><strong>Mobile Controls:</strong></p>
                <ul class="list-disc pl-4 mt-1">
                    <li>🕹️ <strong>Linker kant:</strong> Joystick (Lopen)</li>
                    <li>👆 <strong>Rechter kant:</strong> Slepen om te kijken</li>
                    <li>⚡ <strong>Dubbel Tik (Rechts):</strong> Springen</li>
                    <li>💥 <strong>Knop:</strong> Spuug</li>
                    <li>🍃 <strong>Knop:</strong> Smoke</li>
                </ul>`;
        } else {
            // Instructies voor Desktop (PC)
            hintEl.innerHTML = `
                <p><strong>PC Controls:</strong></p>
                <p>WASD (Loop) | Spatie (Spring) | Muis (Kijk) | Shift (Ren) | LMB (Spuug) | RMB (Smoke)</p>`;
        }
    }

    try {
        updateStatus("firebase", "🔌 Connecting...", "blue");

        const firebaseGlobals = initFirebase((user) => {
            userId = user.uid;
            isMultiplayer = true;
            console.log("Firebase connected! User ID:", userId);
            updateStatus("firebase", "✅ Multiplayer connected!", "green");
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
    // 1. DISTANT GROUND/HORIZON (far below)
    const groundGeo = new THREE.PlaneGeometry(2000, 2000);
    const groundMat = new THREE.MeshLambertMaterial({
        color: 0x3a5f3a,
        fog: true
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -100;
    scene.add(ground);

    // 2. NATURAL MOUNTAIN LANDSCAPE (organic scattered placement)
    const mountainRanges = [];

    // Create multiple natural clusters around the playing area
    const clusters = [
        { centerX: -200, centerZ: -150, count: 25, spread: 120 },  // left-back cluster
        { centerX: 200, centerZ: -200, count: 20, spread: 100 },   // right-back cluster
        { centerX: -180, centerZ: 50, count: 15, spread: 80 },     // left-front cluster
        { centerX: 180, centerZ: 100, count: 12, spread: 70 },     // right-front cluster
        { centerX: 0, centerZ: -450, count: 30, spread: 150 },     // far back center ridge (moved further back)
        { centerX: -100, centerZ: -350, count: 18, spread: 90 },   // additional depth (moved back)
        { centerX: 100, centerZ: -380, count: 18, spread: 90 }     // additional depth (moved back)
    ];

    clusters.forEach(cluster => {
        for (let i = 0; i < cluster.count; i++) {
            // Use Gaussian-like distribution for more natural clustering
            const angle = Math.random() * Math.PI * 2;
            const distance = (Math.random() + Math.random()) / 2 * cluster.spread; // tends toward center

            const x = cluster.centerX + Math.cos(angle) * distance;
            const z = cluster.centerZ + Math.sin(angle) * distance;

            // Vary mountain characteristics based on distance from origin
            const distFromOrigin = Math.sqrt(x * x + z * z);
            const heightVariation = 100 + Math.random() * 120;
            const height = heightVariation * (0.8 + (distFromOrigin / 400) * 0.4); // taller when further

            const width = 20 + Math.random() * 25;

            const mountainGeo = new THREE.ConeGeometry(width, height, 4);
            const mountainMat = new THREE.MeshLambertMaterial({
                color: new THREE.Color().setHSL(
                    0.28 + Math.random() * 0.12, // greenish-brown hues
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

    // 4. UFOs
    const ufos = [];
    for (let i = 0; i < 60; i++) { // create 60 UFOs
        const ufoGroup = new THREE.Group();

        // ---- UFO BODY (thin flying saucer) ----
        const bodyGeo = new THREE.CylinderGeometry(1.5, 2.5, 0.6, 32, 1, true); // smaller body
        const bodyMat = new THREE.MeshStandardMaterial({
            color: 0x888888,
            metalness: 0.7,
            roughness: 0.3
        });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        ufoGroup.add(body);

        // ---- DOME (cockpit) ----
        const domeGeo = new THREE.SphereGeometry(0.75, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2); // smaller dome
        const domeMat = new THREE.MeshStandardMaterial({
            color: 0x00ffcc,
            transparent: true,
            opacity: 0.6,
            metalness: 0.2,
            roughness: 0.1
        });
        const dome = new THREE.Mesh(domeGeo, domeMat);
        dome.position.y = 0.3; // sits nicely on top of smaller body
        ufoGroup.add(dome);

        // ---- BOTTOM RING (glow) ----
        const ringGeo = new THREE.TorusGeometry(2.5, 0.1, 16, 100); // smaller and thinner
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0x00ffcc,
            transparent: true,
            opacity: 0.4, // reduce glow intensity
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2; // horizontal glow ring
        ring.position.y = -0.05; // tighter to the body
        ufoGroup.add(ring);

        // Random position & motion parameters
        const startX = (Math.random() - 0.5) * 500;
        const startY = -20 + Math.random() * 50;
        const startZ = (Math.random() - 0.5) * 200;
        const speed = 5 + Math.random() * 5;
        const rotationSpeed = 0.5 + Math.random() * 0.5;
        const bobAmount = 2 + Math.random() * 1;
        const bobSpeed = 1 + Math.random() * 1.5;

        ufoGroup.position.set(startX, startY, startZ);

        scene.add(ufoGroup);

        ufos.push({
            group: ufoGroup,
            speed: 0.5 + Math.random() * 0.5,          // base forward speed
            pathFrequencyX: 0.2 + Math.random() * 0.3, // frequency for sinusoidal X motion
            pathFrequencyY: 0.1 + Math.random() * 0.2, // frequency for vertical bob
            pathFrequencyZ: 0.15 + Math.random() * 0.25, // frequency for Z weaving
            pathAmplitudeX: 20 + Math.random() * 30,    // horizontal sway
            pathAmplitudeY: 5 + Math.random() * 5,      // vertical bob height
            pathAmplitudeZ: 10 + Math.random() * 20,    // Z weaving amplitude
            rotationSpeed: 0.1 + Math.random() * 0.2,   // gentle rotation
            startX: startX,                              // initial positions
            startY: startY,
            startZ: startZ
        });
    }

    // 4. SPEED PARTICLES (small, colorful, streak-style)
    const particles = [];
    for (let i = 0; i < 2500; i++) {

        // Thin stretched streaks
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

        // random tilt so streaks aren't all perfectly aligned
        particle.rotation.x = (Math.random() - 0.5) * 0.3;
        particle.rotation.y = (Math.random() - 0.5) * 0.3;

        scene.add(particle);
        particles.push({
            mesh: particle,
            speed: 6 + Math.random() * 55,
            hueOffset: Math.random() * Math.PI * 2 // for color cycling
        });
    }
    return { ufos, particles };
}

function animateAtmosphere(atmosphereObjects, delta) {
    const time = Date.now() * 0.001;

    if (atmosphereObjects.ufos) {
        atmosphereObjects.ufos.forEach(ufo => {
            // forward motion along X
            const forward = ufo.speed * delta * 50; // scale for visual effect

            ufo.group.position.x = ufo.startX + Math.sin(time * ufo.pathFrequencyX) * ufo.pathAmplitudeX + forward;
            ufo.group.position.y = ufo.startY + Math.sin(time * ufo.pathFrequencyY) * ufo.pathAmplitudeY;
            ufo.group.position.z = ufo.startZ + Math.sin(time * ufo.pathFrequencyZ) * ufo.pathAmplitudeZ;

            // gentle rotation
            ufo.group.rotation.y += ufo.rotationSpeed * delta;

            // bottom ring pulse
            const ring = ufo.group.children.find(c => c.geometry && c.geometry.type === 'TorusGeometry');
            if (ring && ring.material) {
                const pulse = Math.abs(Math.sin(time * 4 + ufo.group.position.x * 0.01)) * 0.6 + 0.6;
                ring.material.opacity = Math.min(1.0, pulse);
                const baseScale = 1.0;
                ring.scale.set(baseScale * (0.8 + pulse * 0.6), baseScale * (0.8 + pulse * 0.6), 1);
            }
        });
    }

    // Particles - fast streaks with color cycling
    if (atmosphereObjects.particles) {
        atmosphereObjects.particles.forEach(p => {

            // Move forward
            p.mesh.position.z += p.speed * delta * 60 * 0.016;

            // Reset
            if (p.mesh.position.z > 120) {
                p.mesh.position.z = -240;
                p.mesh.position.x = (Math.random() - 0.5) * 300;
                p.mesh.position.y = -10 + Math.random() * 80;
            }

            // Color pulse / cycle (speed effect)
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
        console.log("🔊 Audio systeem klaar en geladen!");
    } catch (error) {
        console.warn("⚠️ Sommige geluiden konden niet laden:", error);
    }
}

function initThreeJS() {
    scene = new THREE.Scene();
    scene.background = baseBg.clone();
    scene.fog = new THREE.Fog(baseFog.clone(), 10, 90);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Light
    const ambient = new THREE.AmbientLight(0xffffff, 0.25);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = true;
    scene.add(dirLight);
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.3);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    const atmosphereObjects = createSkyAtmosphere(scene);
    window.atmosphereObjects = atmosphereObjects; // Store globally

    textureLoader = new THREE.TextureLoader();

    // Ensure correct color encoding for accurate look
    // (important when renderer.outputEncoding isn't the default)
    renderer.outputEncoding = THREE.sRGBEncoding;

    // Load platform texture (Kept for compatibility, though we use generated clouds now)
    platformTexture = textureLoader.load(
        "assets/hava.png",
        // onLoad
        (tex) => {
            // correct encoding so colors/light appear right
            tex.encoding = THREE.sRGBEncoding;

            // make it tileable
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(2, 2);

            // If platforms were already created with fallback materials, replace their maps now
            platforms.forEach((p) => {
                if (p && p.material) {
                    // use a cloned texture so per-platform tiling can be adjusted independently
                    const cloned = tex.clone();
                    // default tiling relative to platform size
                    cloned.repeat.set((p.userData.w || 1) / 2, (p.userData.d || 1) / 2);
                    cloned.needsUpdate = true;

                    p.material.map = cloned;
                    // keep white base under transparent PNG
                    p.material.color = new THREE.Color(0xffffff);
                    p.material.transparent = true;
                    p.material.alphaTest = 0.1;
                    p.material.needsUpdate = true;
                }
            });

            console.log("Platform texture loaded and applied to existing platforms.");
        },
        // onProgress (optional)
        undefined,
        // onError
        (err) => {
            console.warn("Failed to load platform texture hava.png", err);
        }
    );

    // Player Container (for collision detection)
    player = new THREE.Object3D();
    player.position.set(0, 5, 0);
    window.player = player;  // add player to window to be used in multiplayer.js
    scene.add(player);

    // Load the GLB model
    loadPlayerModel(selectedModelFile);

    setupInputs();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    animate();
    setupAudio();
}

function addPlayerLights() {
    if (!player) return;

    // Key light (front, slightly higher)
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
    keyLight.position.set(5, 10, 5);
    keyLight.castShadow = true;
    keyLight.intensity = 1.2;
    player.add(keyLight);

    // Fill light (from other side, softer)
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
    fillLight.position.set(-5, 5, 5);
    fillLight.intensity = 0.4;
    player.add(fillLight);

    // Back light / rim light (behind player, for contours)
    const backLight = new THREE.DirectionalLight(0xffffff, 0.3);
    backLight.position.set(0, 5, -5);
    backLight.intensity = 0.4;
    player.add(backLight);

    // Optional: small point light near model for highlights
    const pointLight = new THREE.PointLight(0xffffff, 0.5, 10);
    pointLight.position.set(0, 3, 0);
    pointLight.intensity = 1;
    player.add(pointLight);
}

function loadPlayerModel(model) {
    const loader = new GLTFLoader();

    // --- ANIMATION CONFIGURATION PER MODEL ---
    // Map filename to correct animation indices
    const ANIMATION_MAPPING = {
        'assets/option2.glb': { idle: 10, run: 0, jump: 9 },
        'assets/medieval_luuk.glb': { idle: 5, run: 2, jump: 0 },
        'assets/leib.glb': { idle: 7, run: 2, jump: 6 }
    };
    // -----------------------------------------

    console.log("Starting to load model...", model);
    updateStatus("model", "🎮 Loading Model... 0%", "purple");

    loader.load(model,
        (gltf) => {
            console.log("Model loaded successfully!", gltf);
            playerModel = gltf.scene;

            // Use per-model scale
            const scale = MODEL_SCALES[model] || MODEL_SCALES['leib.glb'];
            playerModel.scale.set(scale, scale, scale);
            console.log("scale: ", scale)

            // Rotate the model so it faces forward
            playerModel.rotation.y = Math.PI;
            playerModel.position.y = -1.1;

            // Add model to the player container
            player.add(playerModel);

            // Store appearance on player for broadcasting
            player.userData.appearance = {
                model: selectedModelFile,
                scale: scale
            };
            console.log("player: ", player)

            // --- ANIMATION SETUP START ---
            if (gltf.animations && gltf.animations.length > 0) {
                console.log("Animations found in GLB:", gltf.animations.map((a, i) => `${i}: ${a.name}`));

                // Create a mixer for this model
                mixer = new THREE.AnimationMixer(playerModel);

                // 1. Get correct mapping. Fallback to 'option2.glb' defaults.
                const mapping = ANIMATION_MAPPING[model] || ANIMATION_MAPPING['option2.glb'];
                console.log(`Used animation indices for ${model}:`, mapping);

                // 2. Apply indices
                // Use (|| gltf.animations[0]) as safety if index doesn't exist
                animations = {
                    idle: mixer.clipAction(gltf.animations[mapping.idle] || gltf.animations[0]),
                    run: mixer.clipAction(gltf.animations[mapping.run] || gltf.animations[0]),
                    jump: mixer.clipAction(gltf.animations[mapping.jump] || gltf.animations[0])
                };

                // Set looping for animations
                for (const action of Object.values(animations)) {
                    action.setLoop(THREE.LoopRepeat);
                    action.clampWhenFinished = true;
                }

                // Play idle by default
                playAnimation('idle');

            } else {
                console.warn("No animations found in this GLB file.");
            }


            modelLoaded = true;
            updateStatus("model", "✅ Model loaded!", "green");
            checkIfReadyToStart();
        },
        (progress) => {
            if (progress.total > 0) {
                const percent = Math.round(progress.loaded / progress.total * 100);
                updateStatus("model", `🎮 Loading Model... ${percent}%`, "purple");
                console.log('Loading model:', percent + '%');
            }
        },
        (error) => {
            console.error('Error loading model:', error);
            updateStatus("model", "⚠️ Model load failed (using fallback)", "yellow");

            // Fallback: simple box model
            const fallbackGeo = new THREE.BoxGeometry(1, 2, 1);
            const fallbackMat = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
            playerModel = new THREE.Mesh(fallbackGeo, fallbackMat);
            player.add(playerModel);
            addPlayerLights();

            playerModel.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    if (child.material) child.material.needsUpdate = true;
                }
            });

            modelLoaded = true;
            checkIfReadyToStart();
        }
    );
}


// Helper function to combine status messages (unchanged)
const statusMessages = { model: "", firebase: "" };

function updateStatus(type, message, color) {
    statusMessages[type] = { text: message, color: color };

    // Combine both messages
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

    // Determine most "important" color (red > yellow > purple > blue > green)
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

function playAnimation(name) {
    if (!mixer || !animations[name]) return;

    // If already playing, do nothing (unless jump, which can reset)
    if (currentAction === animations[name] && name !== 'jump') return;

    console.log(`%c 🎬 Switching to animation: ${name}`, 'color: yellow; font-weight: bold;');

    const nextAction = animations[name];

    if (currentAction) {
        // Fade out previous
        currentAction.fadeOut(0.2);
    }

    // Reset, fade in and play new
    nextAction.reset().fadeIn(0.2).play();
    currentAction = nextAction;
}

// --- GAMEPLAY FUNCTIONS (unchanged) ---
function activateWeed() {
    if (window.gameState !== 'playing' || coinsCollected < 1 || isTripping) return;
    coinsCollected--;
    ui.coins.innerText = coinsCollected;

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

function updateAnimation(isMoving) {
    if (!isGrounded) {
        if (currentAnimation !== 'jump') {
            playAnimation('jump');
            currentAnimation = 'jump';
            player.userData.currentAnimation = 'jump';
        }
    } else if (isMoving) {
        if (currentAnimation !== 'run') {
            playAnimation('run');
            currentAnimation = 'run';
            player.userData.currentAnimation = 'run';

        }
    } else {
        if (currentAnimation !== 'idle') {
            playAnimation('idle');
            currentAnimation = 'idle';
            player.userData.currentAnimation = 'idle';
        }
    }
}

// --- HELPER FOR NEAREST PLAYER ---
// New helper function to find nearest player
function getNearestPlayerPosition(enemyPosition) {
    let closestTarget = player.position; // Default: yourself
    let minDistance = enemyPosition.distanceTo(player.position);

    // Check all other players in multiplayer
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
let currentAnimation = '';
let isGrounded = false;

function animate() {
    requestAnimationFrame(animate);
    const now = Date.now();
    const delta = 0.016;

    if (window.atmosphereObjects) animateAtmosphere(window.atmosphereObjects, delta);

    // Update animations (Player)
    if (mixer) mixer.update(delta);

    // Update animations (Other Players)
    if (isMultiplayer) {
        updateOtherPlayerAnimations(delta);
    }

    // NIEUW: Update animations (Enemies)
    enemies.forEach(e => {
        if (e.userData.mixer) {
            e.userData.mixer.update(delta);
        }
    });

    if (window.gameState === 'playing') {

        // desktop controls 
        currentGravity = THREE.MathUtils.lerp(currentGravity, targetGravity, delta * 2);
        scene.fog.color.lerp(isTripping ? tripFog : baseFog, delta * 2);
        scene.background.lerp(isTripping ? tripBg : baseBg, delta * 2);

        velocity.y -= currentGravity * delta;
        const drag = isGrounded ? 3.0 : 1.8;
        velocity.x -= velocity.x * 10 * drag * delta;
        velocity.z -= velocity.z * 10 * drag * delta;

        const fwd = new THREE.Vector3(0, 0, -1).applyEuler(player.rotation);
        const right = new THREE.Vector3(1, 0, 0).applyEuler(player.rotation);


        // mobile controls
        if (mobile && mobile.enabled) {
            const m = mobile.update();
            // Gebruik RUN_SPEED zodat de joystick de volledige snelheidsschaal benut
            const mobileBaseSpeed = RUN_SPEED + 4; 

            // 1. Beweging (Velocity based op joystick uitslag)
            if (m.forward) velocity.add(fwd.clone().multiplyScalar(mobileBaseSpeed * delta * 10 * m.forward));
            if (m.backward) velocity.add(fwd.clone().multiplyScalar(-mobileBaseSpeed * delta * 10 * m.backward));
            if (m.left) velocity.add(right.clone().multiplyScalar(-mobileBaseSpeed * delta * 10 * m.left));
            if (m.right) velocity.add(right.clone().multiplyScalar(mobileBaseSpeed * delta * 10 * m.right));

            // 2. Camera Rotatie (Delta based, "drag-to-look")
            if (m.lookDeltaX || m.lookDeltaY) {
                // Horizontaal draaien (Y-as van speler)
                // We trekken de delta af omdat naar links slepen (negatieve X) moet zorgen voor draai naar links (positieve rotatie)
                player.rotation.y -= m.lookDeltaX * m.sensitivity;

                // Verticaal kijken (X-as van camera)
                cameraPitch -= m.lookDeltaY * m.sensitivity;

                // Klem de verticale rotatie af om 'over de kop' gaan te voorkomen
                // (Dezelfde limieten als de PC-muisbesturing: -0.8 tot 0.8 radialen)
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

        updateAnimation(isMoving);

        // FALL CHECK
        if (player.position.y < -30) {
            endGame("Je bent in de afgrond gevallen!", false);
        }

        // --- NEW COLLISION LOGIC (RAYCASTING) ---
        // 1. Ray starts higher up (y + 2.5) to reliably hit the top surface of rounded clouds
        const rayOrigin = player.position.clone().add(new THREE.Vector3(0, 2.5, 0));
        raycaster.set(rayOrigin, downDirection);

        // 2. Check for intersections with all platform objects
        const intersects = raycaster.intersectObjects(platforms);
        let onSolidGround = false;

        if (intersects.length > 0) {
            const hit = intersects[0];

            // MATH FIX:
            // Ray starts at y+2.5. Feet are at y-1.1.
            // Perfect standing distance = 2.5 - (-1.1) = 3.6.
            // We check for < 4.0 to allow for bumps and slopes without falling.
            if (hit.distance < 4.0 && velocity.y <= 0) {

                // Set player Y so feet (-1.1) are exactly on the hit point
                player.position.y = hit.point.y + 1.1;

                velocity.y = 0;
                isGrounded = true;
                onSolidGround = true;
            }
        }

        // If ray hits nothing (or ground is too far), we fall
        if (!onSolidGround) {
            isGrounded = false;
        }

        // WIN CHECK
        if (player.position.z <= CASTLE_Z + 5 &&
            Math.abs(player.position.x) < 10 &&
            player.position.y <= 12) {
            if (window.gameState !== 'ended') {
                endGame("Je hebt het kasteel bereikt! Je wint!", true);
            }
        }

        // UPDATE PROGRESS BAR
        const startZ = 0;
        const endZ = CASTLE_Z;
        const progress = Math.max(0, Math.min(100, ((startZ - player.position.z) / (startZ - endZ)) * 100));
        ui.progressFill.style.width = progress + '%';
        ui.progressText.innerText = Math.round(progress) + '%';

        // --- COIN PICKUP & ROTATION ---
        for (let i = coins.length - 1; i >= 0; i--) {
            // 1. ROTATION: Spin the coin
            coins[i].rotation.y += ASSET_CONFIG.COIN_ROTATION_SPEED * delta;

            // 2. PICKUP CHECK - differentiate between regular coins and stars
            if (player.position.distanceTo(coins[i].position) < 1.5) {
                // Check if this is a star (from enemy) or regular coin
                // Stars are cloned from cachedCoinScene, regular coins are cylinders
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
            }
        }

        // --- ENEMY LOGIC (LOOK AT NEAREST PLAYER) ---
        enemies.forEach(e => {
            // Find nearest target
            const targetPos = getNearestPlayerPosition(e.position);
            // Make enemy look at that point
            e.lookAt(targetPos.x, e.position.y, targetPos.z);
        });

        // ENEMY COLLISIONS
        for (let i = enemies.length - 1; i >= 0; i--) {
            if (player.position.distanceTo(enemies[i].position) < 2.0) {
                velocity.y = 10; velocity.z += 10;
                if (coinsCollected > 0) {
                    coinsCollected = Math.max(0, coinsCollected - 3);
                    ui.coins.innerText = coinsCollected;
                } else {
                    endGame("Gepakt door een vijand!", false);
                }
            }
        }

        // PROJECTILES
        for (let i = projectiles.length - 1; i >= 0; i--) {
            const p = projectiles[i];
            p.mesh.position.add(p.velocity.clone().multiplyScalar(delta));
            p.life -= delta;

            let hit = false;
            for (let j = enemies.length - 1; j >= 0; j--) {
                if (p.mesh.position.distanceTo(enemies[j].position) < 2.0) {
                    // Spawn a coin at the enemy's position before removing
                    spawnStarAtPosition(enemies[j].position.x,
                        enemies[j].position.y + 1, // raise coin slightly above enemy
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

        // We berekenen de positie van de camera ten opzichte van de speler
        const camOffset = new THREE.Vector3(0, 4, 8); // Basis positie (achter/boven speler)

        // 1. Eerst kantelen we de offset voor omhoog/omlaag kijken (rond de X-as)
        camOffset.applyAxisAngle(new THREE.Vector3(1, 0, 0), cameraPitch);

        // 2. Daarna draaien we mee met de speler (rond de Y-as)
        camOffset.applyEuler(player.rotation);

        // 3. Verplaats camera soepel
        const targetCamPos = player.position.clone().add(camOffset);
        camera.position.lerp(targetCamPos, 0.1);

        // 4. Kijk altijd naar net boven het hoofd van de speler
        camera.lookAt(player.position.clone().add(new THREE.Vector3(0, 2, 0)));
    } 
    
    renderer.render(scene, camera);
}

// Actie: Springen
function performJump() {
    // Alleen springen als we op de grond staan (of logic die je wilt)
    // Let op: in je huidige code zet je velocity direct, dus dat nemen we over:
    velocity.y = JUMP_SPEED;
    isGrounded = false;

    // Geluid triggeren (werkt nu voor ALLES: spatie, mobiel, gamepad, etc.)
    if (audioManager) audioManager.playSFX('jump');
}

// Actie: Schieten
function performShoot() {
    // 1. Visuele kogel maken
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2), new THREE.MeshBasicMaterial({ color: 0x00ffff }));
    ball.position.copy(player.position).add(new THREE.Vector3(0, 1.5, 0));
    scene.add(ball);

    // 2. Richting bepalen
    let dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    projectiles.push({ mesh: ball, velocity: dir.multiplyScalar(30), life: 2.0 });

    // 3. Geluid
    if (audioManager) audioManager.playSFX('shoot');
}

function setupInputs() {
    // Character selection buttons
    const charButtons = document.querySelectorAll('.char-btn');
    charButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Update selected model
            selectedModelFile = btn.dataset.model;

            // Remove previous model
            if (playerModel) {
                player.remove(playerModel);
                playerModel.traverse(child => {
                    if (child.isMesh) child.geometry.dispose();
                    if (child.material) child.material.dispose();
                });
            }

            // Load the new model
            loadPlayerModel(selectedModelFile);

            // Highlight selected button
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

            console.log("🔥 ABOUT TO START BROADCASTING - userId:", userId);
            console.log("🔥 player object:", player);
            console.log("🔥 db object:", db);
            console.log("🔥 auth object:", auth);

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
            console.log("trying to broadcast")
            startBroadcasting(userId, myName, db, auth);
            console.log("done with broadcast")
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

        // ✅ Add this line to enable mobile controls now
        if (mobile && mobile.enabled) mobile.start();
    });

    ui.mobileMenuBtn.addEventListener('click', () => {
        const isPaused = ui.pauseScreen.classList.contains('active');
    
        if (isPaused) {
            // SCENARIO 1: Menu is open -> Hervat de game
            // Roep dezelfde actie aan als de "Resume" knop: Vraag Pointer Lock aan.
            if (!mobile || !mobile.enabled) {
                document.body.requestPointerLock();
            } else {
                window.gameState = 'playing';
                ui.pauseScreen.classList.remove('active');
            }
        } else {
            // SCENARIO 2: Menu is gesloten -> Pauzeer de game
            
            // De meest consistente methode is om Pointer Lock te verlaten, wat de 
            // 'pointerlockchange' listener activeert en de PAUZE-logica afhandelt.
            if (document.exitPointerLock) {
                document.exitPointerLock();
            } 
            
            // Fallback voor mobiel/browsers waar Pointer Lock niet is geactiveerd/bestaat:
            // Voer de PAUZE-logica direct uit, omdat de pointerlockchange listener dit niet zal doen.
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
            // Enter fullscreen on the entire document (e.g. <html> element)
            document.documentElement.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
            });
        } else {
            // Exit fullscreen
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
            case 0: // Linker muisknop
                performShoot(); 
                break;
                
            case 2: // Rechter muisknop
                activateWeed();
                break;
        }
    });
    document.querySelectorAll('.char-preview').forEach((el, i) => {
        el.addEventListener('click', () => {
            selectedModelFile = el.dataset.model;

            // Remove old player model
            if (playerModel) {
                player.remove(playerModel);
                playerModel.traverse(child => {
                    if (child.isMesh) child.geometry.dispose();
                    if (child.material) child.material.dispose();
                });
            }

            loadPlayerModel(selectedModelFile);

            // Highlight selected preview
            document.querySelectorAll('.char-preview').forEach(e => e.classList.remove('selected'));
            el.classList.add('selected');
        });
    });
    document.querySelectorAll('.char-preview').forEach(el => {
        loadPreviewModel(el, el.dataset.model);
    });
}

function loadPreviewModel(el, modelFile) {
    // Clean old
    if (el.previewRenderer) el.removeChild(el.previewRenderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, el.clientWidth / el.clientHeight, 0.1, 100);
    camera.position.set(0, 1.5, 3);
    camera.lookAt(0, 1, 0);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);

    const light = new THREE.DirectionalLight(0xffffff, 2.2);
    light.position.set(5, 10, 5);
    scene.add(light);
    const fill = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(fill);

    const loader = new GLTFLoader();
    loader.load(modelFile, (gltf) => {
        const container = new THREE.Object3D();
        container.add(gltf.scene);

        const scale = MODEL_SCALES[modelFile] || MODEL_SCALES['default'];
        container.scale.set(scale, scale, scale);

        container.rotation.y = Math.PI;
        scene.add(container);

        // store for animation
        el.previewRenderer = renderer;
        el.previewModel = container;
        el.previewScene = scene;
        el.previewCamera = camera;

        animatePreview(el);
    });
}
function animatePreview(el) {
    if (!el.previewModel) return;
    el.previewModel.rotation.y += 0.01;
    el.previewRenderer.render(el.previewScene, el.previewCamera);
    requestAnimationFrame(() => animatePreview(el));

}