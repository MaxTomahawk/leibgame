import * as THREE from 'three';
import { syncAndBuildWorld, generateWorldData, ASSET_CONFIG, spawnStarAtPosition, cleanupWorldListener, resetVisibleWorld } from './world.js';
import { MobileControls } from './mobile-controls.js';
import { getInputMode, isTouchInputMode, watchInputMode } from '../../shared/input-mode.js';
import { AudioManager } from '../../shared/audio-manager.js';
import { ModelManager } from '../../shared/model-manager.js';
import { UIManager } from './ui-manager.js';
import { ShopSystem } from './shop-system.js';
import { SettingsManager } from '../../shared/settings-manager.js';
import { loadRonnie, summonCloudPlatform } from './world.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/GLTFLoader.js';
import { WeatherSystem } from './weather.js';
import { DRACOLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/DRACOLoader.js';
import { EffectComposer } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/postprocessing/RenderPass.js';
import { OutlinePass } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/postprocessing/OutlinePass.js';
import { ASSET_BASE_URL, resolveModelKey } from '../../shared/asset-config.js';
import { isSupabaseConfigured, initSupabase, linkAnonymousAccountToEmail, loginWithEmail, logout } from '../../shared/supabase.js';
import { ensurePlayerProfile, savePlayerProgress } from '../../shared/player-service.js';
import { getActiveRoomId, markCoinCollected, regenerateRoomWorld } from '../../shared/room-service.js';

// ===== FEATURE FLAGS =====
const FEATURES = {
    MULTIPLAYER: isSupabaseConfigured(),
    SHOP_ONLINE: isSupabaseConfigured()
};

// ===== ONLINE STATE =====
let supabaseClient = null;
let supabaseAuth = null;
let multiplayerModule = null;
let activeRoomId = getActiveRoomId();
let unsubscribePlayers = null;

async function loadMultiplayerModules () {
    if (!FEATURES.MULTIPLAYER) return;
    try {
        multiplayerModule = await import('./multiplayer.js');
        console.log('✅ Multiplayer modules loaded');
    } catch (e) {
        console.warn('⚠️ Failed to load multiplayer modules:', e);
        FEATURES.MULTIPLAYER = false;
        FEATURES.SHOP_ONLINE = false;
    }
}

function resolveModelPath (path) {
    return resolveModelKey(path);
}

let selectedModelFile = resolveModelPath('leib.glb');
let isStartingGame = false;
let gameVersion = { commit: 'loading...', date: 'loading...' };

// --- PHYSICS & GAMEPLAY SETTINGS ---
const CASTLE_Z = -300;
const BUFF_DURATION = 8000;
const CAST_DELAY = 200; // ms. Sneller gemaakt (was 500) voor 1.5x animatie

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
let unwatchInputMode = null;
let audioManager;
let shopSystem, settingsManager;
let jumpCount = 0;
let isGliding = false;
let weatherSystem;
let lastFrameTime = 0;

const raycaster = new THREE.Raycaster();
const downDirection = new THREE.Vector3(0, -1, 0);

// Trip Mode Variables
let isTripping = false;
let tripTimer = null;
let currentGravity = 20.0;
let targetGravity = 20.0;

// Fetch version on load
fetch('../../version.json')
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
    mobile.onJump = () => performJump(!isFemaleCharacter());
    mobile.onShoot = () => performShoot();
    mobile.onAbility = () => activateWeed();

    // Ability: Cloud
    mobile.onCloud = () => {
        if (shopSystem && shopSystem.hasCloudAbility()) {
            summonCloudPlatform(player.position, scene, platforms, platformTexture);
        }
    };

    // Ability: Glide
    mobile.onGlide = () => {
        if (shopSystem && shopSystem.hasGlideAbility() && !isGrounded) {
            isGliding = !isGliding;
        }
    };

    // Interaction (Tapping the floating finger)
    mobile.onInteract = () => {
        if (window.ronnie && shopSystem) {
            const dist = player.position.distanceTo(window.ronnie.position);
            if (dist < 5) {
                resetMovementFlags();
                shopSystem.interactWithRonnie(starsCollected, coinsCollected, (starDelta, coinDelta) => {
                    starsCollected += starDelta;
                    coinsCollected += coinDelta;
                    uiManager.updateHUD({ stars: starsCollected, coins: coinsCollected });
                    saveUserProgress();
                    // Update buttons in case we bought something
                    updateMobileAbilities();
                });
            }
        }
    };
}

function updateMobileAbilities() {
    if (mobile && mobile.enabled && shopSystem) {
        mobile.setAbilities(shopSystem.hasCloudAbility(), shopSystem.hasGlideAbility());
    }
}

async function saveUserProgress () {
    const data = {
        coins: coinsCollected,
        stars: starsCollected,
        lastSaved: Date.now()
    };

    if (FEATURES.MULTIPLAYER && supabaseClient && userId) {
        try {
            const upgrades = shopSystem ? shopSystem._upgradesToObject() : undefined;
            await savePlayerProgress(supabaseClient, userId, {
                coins: coinsCollected,
                stars: starsCollected,
                upgrades,
                ronnieUnlocked: shopSystem?.isRonnieUnlocked
            });
            console.log('✅ Progress saved to Supabase');
            updateMobileAbilities();
            return;
        } catch (e) {
            console.warn('⚠️ Supabase save failed:', e);
        }
    }

    localStorage.setItem('gameProgress', JSON.stringify(data));
    if (shopSystem) shopSystem._saveLocalData();
    updateMobileAbilities();
    console.log('💾 Progress saved locally');
}

async function loadUserProgress (profile) {
    if (profile) {
        coinsCollected = profile.coins || 0;
        starsCollected = profile.stars || 0;
        console.log('✅ Progress loaded from Supabase');
        return;
    }

    const saved = localStorage.getItem('gameProgress');
    if (saved) {
        const data = JSON.parse(saved);
        coinsCollected = data.coins || 0;
        starsCollected = data.stars || 0;
        console.log('💾 Progress loaded locally');
    }
}

function getOnlineContext () {
    if (!isMultiplayer || !supabaseClient || !userId) return null;
    return { supabase: supabaseClient, roomId: activeRoomId, userId };
}


function stopMultiplayerSession () {
    if (multiplayerModule?.stopBroadcasting) {
        multiplayerModule.stopBroadcasting();
    } else if (window.broadcastInterval) {
        clearInterval(window.broadcastInterval);
        window.broadcastInterval = null;
    }
    if (unsubscribePlayers) {
        unsubscribePlayers();
        unsubscribePlayers = null;
    }
    cleanupWorldListener();
}

function isRendererUsable () {
    return !!(renderer?.domElement?.isConnected && document.body.contains(renderer.domElement));
}

function ensureRendererAttached () {
    if (!renderer) return false;
    if (!renderer.domElement.id) renderer.domElement.id = 'game-canvas';
    if (!renderer.domElement.isConnected) {
        document.body.prepend(renderer.domElement);
    }
    return true;
}

function reloadCharacterPreviews () {
    if (!uiManager || !modelManager) return;
    uiManager.getCharacterPreviewElements().forEach((el) => {
        modelManager.loadPreviewModel(el, resolveModelPath(el.dataset.model));
    });
}

/** Reset to start screen without destroying WebGL (safe for bfcache / second play). */
function resetSessionForReplay () {
    console.log('🔄 Resetting session for replay');
    stopMultiplayerSession();

    window.gameState = 'start';
    isStartingGame = false;
    isTripping = false;
    isGliding = false;
    jumpCount = 0;
    velocity.set(0, 0, 0);

    if (scene && platforms) {
        resetVisibleWorld(scene, platforms, coins, enemies, projectiles);
    }

    if (player) {
        player.position.set(0, 5, 0);
        player.rotation.set(0, 0, 0);
    }

    document.body.classList.remove('game-playing');
    ensureRendererAttached();

    if (uiManager) {
        uiManager.dom.startScreen.classList.add('active');
        uiManager.dom.progressBar.style.display = 'none';
        uiManager.dom.gameOverScreen?.classList.remove('active');
        uiManager.togglePauseScreen(false);
        reloadCharacterPreviews();
    }

    if (isMultiplayer && multiplayerModule && supabaseClient && userId && scene) {
        unsubscribePlayers = multiplayerModule.listenToPlayers(
            scene,
            userId,
            { peers: uiManager.dom.peerCount },
            supabaseClient,
            activeRoomId
        );
    }
}

function onPageHide () {
    // Stop network work only — never dispose WebGL (breaks bfcache / second visit).
    stopMultiplayerSession();
}

window.addEventListener('pagehide', onPageHide);
window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
        resetSessionForReplay();
    } else if (!isRendererUsable()) {
        window.location.reload();
    }
});

window.onload = async () => {
    uiManager = new UIManager();
    settingsManager = new SettingsManager();
    uiManager.setVersion(gameVersion.commit, gameVersion.date);

    // Define theme logic separately so it can be applied on startup
    const applyThemeSettings = (themeVal) => {
        if (!weatherSystem) return;

        if (themeVal === 'dynamic') {
            // OPTION 1: Dynamic (Default) 🌈
            console.log("🌈 Dynamic Mode: Activated!");
            weatherSystem.setMode('dynamic');

        } else if (themeVal === 'auto') {
            // OPTION 2: System Auto 🌗
            weatherSystem.setMode('static');
            const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            weatherSystem.setWeather(isDark ? 'night' : 'day');

        } else {
            // OPTION 3 & 4: Manual Light/Dark ☀️/🌙
            weatherSystem.setMode('static');
            const weatherType = (themeVal === 'dark') ? 'night' : 'day';
            weatherSystem.setWeather(weatherType);
        }
    };

    // Setup theme toggle using the defined logic
    uiManager.setupThemeToggle(settingsManager, applyThemeSettings);

    initThreeJS();

    // Apply the saved theme immediately after initialization
    const currentTheme = settingsManager.get('theme') || 'dynamic';
    applyThemeSettings(currentTheme);

    mobile = new MobileControls(isTouchInputMode());
    handleMobileControls(mobile);
    uiManager.setControlsHint(mobile.enabled);
    unwatchInputMode = watchInputMode((mode) => {
        const touch = isTouchInputMode(mode);
        mobile.setTouchMode(touch);
        uiManager.setControlsHint(touch);
    });

    // Load multiplayer modules first
    await loadMultiplayerModules();

    if (FEATURES.MULTIPLAYER) {
        try {
            uiManager.updateStatus('online', '🔌 Connecting...', 'blue');
            await initSupabase(async (user, supabase) => {
                supabaseClient = supabase;
                supabaseAuth = user;
                userId = user.id;
                isMultiplayer = true;
                activeRoomId = getActiveRoomId();

                const profile = await ensurePlayerProfile(supabase, userId, myName);
                console.log('✅ Supabase connected!');
                uiManager.updateStatus('online', '✅ Online!', 'green');

                shopSystem = new ShopSystem(uiManager, supabase, userId);
                await shopSystem.syncUserData(profile);
                await loadUserProgress(profile);
                uiManager.initHUD(coinsCollected, starsCollected);
                checkIfReadyToStart();

                if (multiplayerModule) {
                    unsubscribePlayers = multiplayerModule.listenToPlayers(
                        scene,
                        userId,
                        { peers: uiManager.dom.peerCount },
                        supabase,
                        activeRoomId
                    );
                }
            });
        } catch (e) {
            console.error('❌ Supabase error:', e);
            uiManager.updateStatus('online', '⚠️ Offline', 'yellow');
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
    shopSystem.loadLocalData(); // <--- NEW: Load local data

    await loadUserProgress();
    uiManager.initHUD(coinsCollected, starsCollected);
    uiManager.updateStatus('online', '🎮 Offline', 'gray');

    checkIfReadyToStart();
}


function checkIfReadyToStart() {
    if (modelLoaded) {
        uiManager.enableStartButton();
    }
}

const AUDIO_ASSETS = {
    bgm: `${ASSET_BASE_URL}sounds/soundtrack/hava_leib.mp3`,
    jump: `${ASSET_BASE_URL}sounds/effects/male_jump.wav`,
    jump_female: `${ASSET_BASE_URL}sounds/effects/female_jump.wav`,
    coin: `${ASSET_BASE_URL}sounds/effects/coin.wav`,
    hava: `${ASSET_BASE_URL}sounds/effects/hava.wav`,
    shoot: `${ASSET_BASE_URL}sounds/effects/spit.wav`,
    fail: `${ASSET_BASE_URL}sounds/effects/fail.wav`,
    win: `${ASSET_BASE_URL}sounds/effects/win.wav`
};

async function setupAudio() {
    audioManager = new AudioManager(camera);
    const loadPromises = Object.entries(AUDIO_ASSETS).map(([key, path]) => {
        return audioManager.load(key, path);
    });
    try {
        await Promise.all(loadPromises);
        console.log("🔊 Audio system ready!");

        const savedAudio = settingsManager.get('audio');
        if (savedAudio) {
            audioManager.updateVolumes(savedAudio);
        }

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
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'default' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.domElement.id = 'game-canvas';
    document.body.appendChild(renderer.domElement);

    // --- POST-PROCESSING SETUP (Voor Trip Mode) ---
    const composer = new EffectComposer(renderer);
    window.composer = composer; // Maak globaal bereikbaar

    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const outlinePass = new OutlinePass(new THREE.Vector2(window.innerWidth, window.innerHeight), scene, camera);
    outlinePass.edgeStrength = 3.0; // Dikte/Kracht
    outlinePass.edgeGlow = 0.5;     // Gloed
    outlinePass.edgeThickness = 1.0;
    outlinePass.pulsePeriod = 0;    // We doen dit handmatig op audio
    outlinePass.visibleEdgeColor.set('#ffffff');
    outlinePass.hiddenEdgeColor.set('#000000');
    window.outlinePass = outlinePass; // Maak globaal
    composer.addPass(outlinePass);

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
        `${ASSET_BASE_URL}hava.png`,
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
    const ronnieLoader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    ronnieLoader.setDRACOLoader(dracoLoader);
    loadRonnie(scene, ronnieLoader, { x: 0, y: 1.4, z: 5 });

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

    initFireballAssets();
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
    if (!won) {
        audioManager.playSFX('fail')
    } else {
        audioManager.playSFX('win')
    }
    window.gameState = 'ended';
    document.exitPointerLock();
    uiManager.showGameOver(reason, won);

    if (won && getOnlineContext()) {
        console.log('🏆 Regenerating world...');
        regenerateWorld();
    }
}

async function regenerateWorld () {
    const ctx = getOnlineContext();
    if (!ctx) return;
    try {
        await regenerateRoomWorld(ctx.supabase, ctx.roomId, ctx.userId, generateWorldData, CASTLE_Z);
        console.log('✅ World regenerated!');
    } catch (e) {
        console.error('❌ World regen failed:', e);
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

function animate(time) {
    requestAnimationFrame(animate);

    const delta = (time - lastFrameTime) / 750;
    lastFrameTime = time;

    if (delta > 0.1) return;

    // --- START AUTO THEME CHECK ---
    // Alleen checken als we echt op 'auto' staan
    if (settingsManager && settingsManager.get('theme') === 'auto' && weatherSystem) {
        const sysDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        const targetWeather = sysDark ? 'night' : 'day';

        if (weatherSystem.getCurrentWeather() !== targetWeather) {
            weatherSystem.setWeather(targetWeather);
        }
    }
    // --- EINDE AUTO THEME CHECK ---

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

    let audioLevel = 0;
    let bassLevel = 0;
    if (audioManager?.musicSound?.isPlaying) {
        const audioData = audioManager.getAudioData();
        audioLevel = audioData.average / 255.0;
        bassLevel = audioData.bass / 255.0;
    }

    if (weatherSystem) {
        weatherSystem.update(delta, isTripping, audioLevel);
    }

    const isClearNight = weatherSystem.getCurrentWeather() === 'night' && weatherSystem.isStarFieldVisible();
    if (isClearNight || isTripping) {
        scene.fog.far = 10000; // Effectively disable fog
    } else {
        scene.fog.far = 90; // Normal fog distance
    }

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

        const sky = scene.children.find(child => child.userData.skyMaterial);
        if (sky && sky.userData.skyMaterial) {
            let targetSkyColor = new THREE.Color(0xffffff); // Default day

            if (currentWeather === 'night' && !isTripping) {
                targetSkyColor.setHex(0x0a0a1a); // Very dark blue
            } else if (isTripping) {
                targetSkyColor.setHex(0x113311); // Trip mode green tint
            } else {
                targetSkyColor.setHex(0xffffff); // Bright day
            }

            // LERP the sky color smoothly
            sky.userData.skyMaterial.color.lerp(targetSkyColor, delta * 2.0);
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

        // Calculate local velocity for strafing animations
        const localVelocity = velocity.clone();
        localVelocity.applyEuler(new THREE.Euler(0, -player.rotation.y, 0));
        // Nu is localVelocity.z = vooruit, localVelocity.x = opzij

        const currentAnim = modelManager.updateAnimation({
            isMoving: isMoving,
            isGrounded: isGrounded,
            isSprinting: isSprinting,
            verticalVelocity: velocity.y,
            isGliding: isGliding,
            localVelocity: localVelocity // <-- Cruciaal voor strafe animaties
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
                endGame("You reached the castle!", true);
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

                const coinId = c.userData.coinId;
                const ctx = getOnlineContext();
                if (ctx && coinId !== undefined) {
                    markCoinCollected(ctx.supabase, ctx.roomId, coinId).catch((err) => {
                        console.warn('Shared coin sync failed:', err);
                    });
                }

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

            // 🔥 Define time for sprite animation
            const time = performance.now() * 0.001; // seconds

            // Animate flame sprites
            p.mesh.children.forEach((sprite, idx) => {
                sprite.material.opacity = 0.8 + Math.sin(time * 10 + idx) * 0.2;
                const s = 0.5 + Math.sin(time * 10 + idx) * 0.2;
                sprite.scale.set(s, s, 1);
                sprite.material.rotation += delta * (idx % 2 === 0 ? 5 : -5);
            });

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

        const smoothFactor = 5.0 * delta;
        camera.position.lerp(targetCamPos, smoothFactor);

        camera.lookAt(player.position.clone().add(new THREE.Vector3(0, 2, 0)));

        // Handle interaction prompts
        if (window.ronnie) {
            const dist = player.position.distanceTo(window.ronnie.position);

            // Check mobile vs desktop logic
            if (mobile && mobile.enabled) {
                // Mobile: Hide "E", show finger emoji at screen coords
                const prompt = window.ronnie.children.find(c => c.name === "InteractionPrompt");
                if (prompt) prompt.visible = false;

                if (dist < 5) {
                    const pos = window.ronnie.position.clone().add(new THREE.Vector3(0, 3.5, 0));
                    pos.project(camera);

                    // Check if object is behind camera
                    if (pos.z < 1) {
                        const x = (pos.x * .5 + .5) * window.innerWidth;
                        const y = (-(pos.y * .5) + .5) * window.innerHeight;
                        mobile.updateInteractPosition(x, y, true);
                    } else {
                        mobile.updateInteractPosition(0, 0, false);
                    }
                } else {
                    mobile.updateInteractPosition(0, 0, false);
                }
            } else {
                // Desktop: Show "E" prompt
                const prompt = window.ronnie.children.find(c => c.name === "InteractionPrompt");
                if (prompt) {
                    prompt.visible = (dist < 5);
                    if (prompt.visible) {
                        prompt.position.y = 2.8 + Math.sin(Date.now() * 0.005) * 0.1;
                    }
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

        if (isTripping) {
            const pulse = 1.0 + (bassLevel * 0.5);
            scene.fog.density = 0.02 * pulse;

            const hueShift = (Date.now() * 0.001) + (audioLevel * 0.2);
            scene.fog.color.setHSL(hueShift % 1, 0.6, 0.5);
        }
    }

    // --- RENDER LOGICA ---
    if (isTripping && window.composer && window.outlinePass) {
        // 1. Audio data ophalen
        let bass = 0;
        let mid = 0;
        if (audioManager && audioManager.musicSound && audioManager.musicSound.isPlaying) {
            const data = audioManager.getAudioData();
            // We pakken de bass iets gevoeliger (alles boven 0.1 telt)
            bass = Math.max(0, (data.bass / 255.0) - 0.1);
            mid = data.mid / 255.0;
        }

        // 2. Selecteer objecten (indien nodig, dit kan ook buiten de loop als het traag wordt)
        const targets = [];
        scene.traverse((obj) => {
            if (obj.isMesh && obj.name !== 'SkySphere') {
                targets.push(obj);
            }
        });
        window.outlinePass.selectedObjects = targets;

        // 3. VISUALIZER: Het "Dans" Effect
        // edgeThickness: Maakt de lijn fysiek breder (van 1.0 naar 4.0 op de beat)
        // Dit zorgt voor het 'dikker/dunner' worden effect waar je om vroeg
        window.outlinePass.edgeThickness = 1.0 + (bass * 3.0);

        // edgeStrength: Hoeveelheid 'inkt' (van 3.0 naar 10.0)
        window.outlinePass.edgeStrength = 1.0 + (bass * 9.0);

        // edgeGlow: De wazige gloed eromheen (geeft een 'aura' effect bij harde bass)
        window.outlinePass.edgeGlow = 0.0 + (bass * 1.5);

        // 4. KLEUR: Rustiger en trager
        // Snelheid: * 0.0002 is 10x trager dan * 0.002
        const time = Date.now() * 0.0002;

        // Hue: Draait langzaam rond, met een heel klein beetje invloed van de melodie (mid)
        const hue = (time + (mid * 0.1)) % 1;

        // Kleur instellen: Saturation op 0.6 (i.p.v. 1.0) maakt het minder fel/neon
        const color = new THREE.Color().setHSL(hue, 0.2, 0.4);
        window.outlinePass.visibleEdgeColor.set(color);

        // Render via de Composer
        window.composer.render();

    } else {
        // Normale modus
        renderer.render(scene, camera);
    }
}

function performJump(male=true) {
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
        if (male) {
            if (audioManager) audioManager.playSFX('jump');
        } else {
            if (audioManager) audioManager.playSFX("jump_female")
        }
    }
}

// Global/shared fireball assets
let flameTexture;
let flameMaterial;

function initFireballAssets() {
    // 🔥 Load flame sprite texture ONCE
    flameTexture = new THREE.TextureLoader().load(`${ASSET_BASE_URL}fire.png`);
    flameTexture.encoding = THREE.sRGBEncoding;
    renderer.outputEncoding = THREE.sRGBEncoding;

    flameMaterial = new THREE.SpriteMaterial({
        map: flameTexture,
        transparent: true,
        opacity: 1.0,
        depthWrite: false, // prevents sorting issues
        blending: THREE.AdditiveBlending,
        color: 0xff3300
    });
}


function performShoot() {
    // === COOLDOWN CHECK ===
    // Only block if NOT rapid fire
    if (!shopSystem?.hasRapidFire() && modelManager.isAttacking) return;
    const triggered = modelManager.triggerThrowAnimation();

    if (triggered) {
        // Delay the projectile spawn.
        // Was 500ms, nu CAST_DELAY (200ms) omdat animatie 1.5x sneller is.
        setTimeout(() => {
            // Safety check: ensure game is still running
            if (window.gameState !== 'playing') return;

            const fireball = new THREE.Object3D(); // container

            // 🔥 Add two overlapping flame sprites for a dynamic look
            for (let i = 0; i < 2; i++) {
                const sprite = new THREE.Sprite(flameMaterial.clone());
                sprite.scale.set(0.5 + Math.random() * 0.3, 0.5 + Math.random() * 0.3, 1);
                sprite.position.set(0, 0, 0);
                fireball.add(sprite);
            }

            // Spawn position (Calculated at the moment of firing)
            const spawnPos = modelManager.getProjectileSpawnPosition(player.position);
            fireball.position.copy(spawnPos);

            scene.add(fireball);

            // Direction
            let dir = new THREE.Vector3();
            camera.getWorldDirection(dir);

            projectiles.push({
                mesh: fireball,
                velocity: dir.multiplyScalar(30),
                life: 2.0
            });

            if (audioManager) audioManager.playSFX('shoot');
        }, CAST_DELAY);
    }
}

function resetMovementFlags() {
    moveF = false;
    moveB = false;
    moveL = false;
    moveR = false;
    isSprinting = false;
    isGliding = false;
}


function setupInputs() {
    // --- 1. UI & Auth Events ---
    if (FEATURES.MULTIPLAYER) {
        uiManager.onLinkAccount(linkAnonymousAccountToEmail);
        uiManager.onLogin(loginWithEmail);
        uiManager.onLogout(logout);
    } else {
        uiManager.onLinkAccount(() => console.log('Auth disabled in offline mode'));
        uiManager.onLogin(() => console.log('Auth disabled in offline mode'));
        uiManager.onLogout(() => console.log('Auth disabled in offline mode'));
    }

    // Character Selection
    const previews = uiManager.getCharacterPreviewElements();
    previews.forEach(el => {
        modelManager.loadPreviewModel(el, resolveModelPath(el.dataset.model));
    });

    uiManager.onCharacterSelect((modelPath) => {
        selectedModelFile = resolveModelPath(modelPath);
        if (modelManager.playerModel) {
            player.remove(modelManager.playerModel);
        }
        modelManager.disposePlayerModel();
        modelManager.loadPlayerModel(selectedModelFile, player, {
            onProgress: (t, m, c) => uiManager.updateStatus(t, m, c),
            onLoaded: (t, m, c) => {
                uiManager.updateStatus(t, m, c);
                modelLoaded = true;
                checkIfReadyToStart();
            },
            onError: (t, m, c) => {
                uiManager.updateStatus(t, m, c);
                modelLoaded = true;
                checkIfReadyToStart();
            }
        });
    });

    // Game State Events
    uiManager.onStart(async (name) => {
        if (isStartingGame || window.gameState === 'playing') return;
        isStartingGame = true;
        try {
            if (name) myName = name;
            modelManager.disposeAllPreviews();
            uiManager.startGameUI(myName);

            const ctx = getOnlineContext();
            if (ctx && multiplayerModule) {
                try {
                    multiplayerModule.startBroadcasting(userId, myName, ctx.supabase, ctx.roomId);
                    console.log('✅ Multiplayer broadcasting started');
                } catch (e) {
                    console.error('❌ Multiplayer start failed:', e);
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

            await syncAndBuildWorld(scene, worldUI, platforms, coins, enemies, projectiles, getOnlineContext(), CASTLE_Z, platformTexture, textureLoader);

            if (!mobile || !mobile.enabled) {
                try {
                    document.body.requestPointerLock();
                } catch (_e) { /* optional — e.g. automated tests */ }
            }
            window.gameState = 'playing';
            if (mobile && mobile.enabled) {
                mobile.start();
                updateMobileAbilities();
            }
        } finally {
            isStartingGame = false;
        }
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
        if (action === 'jump') performJump(!isFemaleCharacter());

        // INTERACTIE (E) - Praten met Ronnie
        if (action === 'interact') {
            if (window.ronnie && shopSystem) {
                const dist = player.position.distanceTo(window.ronnie.position);
                if (dist < 5) {
                    resetMovementFlags();
                    shopSystem.interactWithRonnie(starsCollected, coinsCollected, (starDelta, coinDelta) => {
                        starsCollected += starDelta;
                        coinsCollected += coinDelta;
                        uiManager.updateHUD({ stars: starsCollected, coins: coinsCollected });
                        saveUserProgress();
                        // Update abilities after purchase
                        updateMobileAbilities();
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

function isFemaleCharacter () {
    return selectedModelFile.includes('katinka');
}