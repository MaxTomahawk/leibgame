import * as THREE from 'three';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/DRACOLoader.js';
import { SkeletonUtils } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/utils/SkeletonUtils.js';
import { generateLevel, PHYSICS, DIFFICULTY } from './level-generator.js';
import { assetRegistry } from '../../shared/asset-registry.js';
import { ModelManager } from '../../shared/model-manager.js';
import { AudioManager } from '../../shared/audio-manager.js';

// --- State ---
let scene, camera, renderer, player, modelManager, audioManager;
let velocity = new THREE.Vector3();
let platforms = [], coins = [], stars = [], enemies = [];
let levelData = null;
let selectedModelId = 'leib';
let selectedDifficulty = 'normal';
let score = 0, starScore = 0;
let gameState = 'menu';
let isGrounded = false;
let facingDir = 1;
let moveLeft = false, moveRight = false;
let modelLoaded = false;
let cachedCoinScene = null;
let cachedEnemyGLTF = null;
let enemyMixers = [];
let levelNumber = 1;

const raycaster = new THREE.Raycaster();
const down = new THREE.Vector3(0, -1, 0);

// --- Init ---
async function init() {
    await assetRegistry.load();
    await preloadProps();
    populateCharacters();
    setupDifficultyButtons();
    setupMobileControls();
    initThreeJS();
    setupMenuEvents();
    animate();
}

async function preloadProps() {
    const loader = createGLTFLoader();
    const quality = assetRegistry.getGraphicsQuality() === 'low' ? 'low' : 'high';

    const coinUrl = assetRegistry.getModelUrl('coin', quality);
    const enemyUrl = assetRegistry.getModelUrl('enemy', quality);

    await Promise.all([
        new Promise(resolve => loader.load(coinUrl, gltf => { cachedCoinScene = gltf.scene; resolve(); }, undefined, resolve)),
        new Promise(resolve => loader.load(enemyUrl, gltf => { cachedEnemyGLTF = gltf; resolve(); }, undefined, resolve)),
    ]);
}

function createGLTFLoader() {
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    loader.setDRACOLoader(draco);
    return loader;
}

function initThreeJS() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x5c94fc);
    scene.fog = new THREE.Fog(0x5c94fc, 30, 80);

    const aspect = window.innerWidth / window.innerHeight;
    const frustum = 12;
    camera = new THREE.OrthographicCamera(
        -frustum * aspect, frustum * aspect, frustum, -frustum, 0.1, 200
    );
    camera.position.set(0, 5, 20);
    camera.lookAt(0, 5, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(10, 20, 10);
    sun.castShadow = true;
    scene.add(sun);

    player = new THREE.Object3D();
    player.position.set(0, 2, 0);
    scene.add(player);

    modelManager = new ModelManager();
    modelManager.setFacingMode('sideScroller');

    audioManager = new AudioManager(camera);
    const audioMap = assetRegistry.buildAudioMap();
    Promise.all(Object.entries(audioMap).map(([k, v]) => audioManager.load(k, v)))
        .then(() => console.log('🔊 Audio ready'))
        .catch(e => console.warn('Audio load warning', e));

    modelManager.loadPlayerModel(selectedModelId, player, {
        onLoaded: () => {
            modelLoaded = true;
            document.getElementById('start-btn').disabled = false;
            document.getElementById('start-btn').textContent = 'Start Level';
        },
        onError: () => {
            modelLoaded = true;
            document.getElementById('start-btn').disabled = false;
            document.getElementById('start-btn').textContent = 'Start Level';
        },
    });

    window.addEventListener('resize', onResize);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
}

function onResize() {
    const aspect = window.innerWidth / window.innerHeight;
    const frustum = 12;
    camera.left = -frustum * aspect;
    camera.right = frustum * aspect;
    camera.top = frustum;
    camera.bottom = -frustum;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- Character & menu ---
function populateCharacters() {
    const container = document.getElementById('char-container');
    const players = assetRegistry.getSelectablePlayers();
    container.innerHTML = '';

    players.forEach((p, i) => {
        const div = document.createElement('div');
        div.className = 'char-preview' + ((p.default || i === 0) ? ' selected' : '');
        div.dataset.model = p.id;
        div.title = p.displayName || p.id;
        container.appendChild(div);
        modelManager.loadPreviewModel(div, p.id);
    });

    const defaultP = players.find(p => p.default) || players[0];
    if (defaultP) selectedModelId = defaultP.id;

    container.querySelectorAll('.char-preview').forEach(el => {
        el.addEventListener('click', () => {
            container.querySelectorAll('.char-preview').forEach(c => c.classList.remove('selected'));
            el.classList.add('selected');
            selectedModelId = el.dataset.model;
            modelManager.dispose();
            if (modelManager.playerModel) player.remove(modelManager.playerModel);
            modelManager.loadPlayerModel(selectedModelId, player);
        });
    });
}

function setupDifficultyButtons() {
    document.querySelectorAll('.diff-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedDifficulty = btn.dataset.diff;
        });
    });
}

function setupMenuEvents() {
    document.getElementById('start-btn').addEventListener('click', startGame);
    document.getElementById('restart-btn').addEventListener('click', () => {
        document.getElementById('game-over-screen').classList.remove('active');
        startGame();
    });
}

function setupMobileControls() {
    const bind = (id, down, up) => {
        const el = document.getElementById(id);
        el.addEventListener('touchstart', e => { e.preventDefault(); down(); });
        el.addEventListener('touchend', e => { e.preventDefault(); up(); });
        el.addEventListener('mousedown', down);
        el.addEventListener('mouseup', up);
        el.addEventListener('mouseleave', up);
    };
    bind('mob-left', () => { moveLeft = true; }, () => { moveLeft = false; });
    bind('mob-right', () => { moveRight = true; }, () => { moveRight = false; });
    bind('mob-jump', () => { tryJump(); }, () => {});
}

function onKeyDown(e) {
    if (gameState !== 'playing') return;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') moveLeft = true;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') moveRight = true;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') tryJump();
}

function onKeyUp(e) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') moveLeft = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') moveRight = false;
}

function isFemaleCharacter() {
    return assetRegistry.getModel(selectedModelId)?.gender === 'F';
}

function tryJump() {
    if (gameState !== 'playing' || !isGrounded) return;
    velocity.y = PHYSICS.JUMP_VELOCITY;
    isGrounded = false;
    audioManager?.playSFX(isFemaleCharacter() ? 'jump_female' : 'jump');
}

// --- Level building ---
function clearLevel() {
    [...platforms, ...coins, ...stars, ...enemies].forEach(obj => {
        scene.remove(obj);
        obj.traverse?.(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                else child.material.dispose();
            }
        });
    });
    platforms = []; coins = []; stars = []; enemies = [];
    enemyMixers = [];
}

function buildLevel(data) {
    clearLevel();
    levelData = data;

    const platMat = new THREE.MeshStandardMaterial({ color: 0x6b8e23 });
    const goalMat = new THREE.MeshStandardMaterial({ color: 0xffd700 });

    const texLoader = new THREE.TextureLoader();
    texLoader.load(assetRegistry.getTextureUrl('hava'), tex => {
        platMat.map = tex;
        platMat.needsUpdate = true;
    });

    for (const p of data.platforms) {
        const geo = new THREE.BoxGeometry(p.w, p.h, 2);
        const mat = p.type === 'goal' ? goalMat : platMat.clone();
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(p.x + p.w / 2, p.y + p.h / 2, 0);
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        mesh.userData = { ...p, isPlatform: true };
        scene.add(mesh);
        platforms.push(mesh);
    }

    // Goal flag pole
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.08, 3, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(data.goalX, data.goalY + 1.5, 0);
    scene.add(pole);
    platforms.push(pole);

    const flagGeo = new THREE.PlaneGeometry(1.2, 0.8);
    const flagMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, side: THREE.DoubleSide });
    const flag = new THREE.Mesh(flagGeo, flagMat);
    flag.position.set(data.goalX + 0.6, data.goalY + 2.5, 0);
    flag.userData.isGoal = true;
    scene.add(flag);
    platforms.push(flag);

    // Coins
    for (const c of data.coins) {
        const coin = createCoinMesh(c);
        scene.add(coin);
        coins.push(coin);
    }

    // Stars
    for (const s of data.stars) {
        const star = createStarMesh(s);
        scene.add(star);
        stars.push(star);
    }

    // Enemies
    for (const e of data.enemies) {
        const enemy = createEnemyMesh(e);
        scene.add(enemy);
        enemies.push(enemy);
    }

    player.position.set(data.spawnX, data.spawnY, 0);
    velocity.set(0, 0, 0);
    facingDir = 1;
}

function createCoinMesh(data) {
    let mesh;
    if (cachedCoinScene) {
        mesh = cachedCoinScene.clone();
        mesh.scale.set(0.4, 0.4, 0.4);
    } else {
        const geo = new THREE.CylinderGeometry(0.3, 0.3, 0.08, 12);
        const mat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.8 });
        mesh = new THREE.Mesh(geo, mat);
    }
    mesh.position.set(data.x, data.y, 0);
    mesh.userData = { ...data, isCoin: true, collected: false };
    mesh.rotation.x = Math.PI / 2;
    return mesh;
}

function createStarMesh(data) {
    const geo = new THREE.OctahedronGeometry(0.35, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0xaa8800 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(data.x, data.y, 0);
    mesh.userData = { ...data, isStar: true, collected: false };
    return mesh;
}

function createEnemyMesh(data) {
    let mesh;
    if (cachedEnemyGLTF) {
        mesh = SkeletonUtils.clone(cachedEnemyGLTF.scene);
        mesh.scale.set(0.8, 0.8, 0.8);
        const mixer = new THREE.AnimationMixer(mesh);
        if (cachedEnemyGLTF.animations.length > 0) {
            const action = mixer.clipAction(cachedEnemyGLTF.animations[0]);
            action.play();
        }
        enemyMixers.push(mixer);
        mesh.userData.mixer = mixer;
        // Face movement direction
        mesh.rotation.y = data.direction > 0 ? -Math.PI / 2 : Math.PI / 2;
    } else {
        const geo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
        const mat = new THREE.MeshStandardMaterial({ color: 0xcc3333 });
        mesh = new THREE.Mesh(geo, mat);
    }
    mesh.position.set(data.x, data.y + 0.5, 0);
    mesh.userData = { ...data, isEnemy: true };
    return mesh;
}

function startGame() {
    if (!modelLoaded) return;

    document.getElementById('start-screen').classList.remove('active');
    document.getElementById('hud').style.display = 'flex';
    document.getElementById('mult-display').textContent = `×${DIFFICULTY[selectedDifficulty].rewardMultiplier}`;

    const seed = Date.now() + levelNumber * 9973;
    const data = generateLevel(selectedDifficulty, seed);
    buildLevel(data);

    score = 0;
    updateHUD();
    gameState = 'playing';
    audioManager?.playMusic('bgm');
}

function updateHUD() {
    document.getElementById('score-display').textContent = score;
    document.getElementById('star-display').textContent = starScore;
    document.getElementById('level-display').textContent = `${DIFFICULTY[selectedDifficulty].label} · Lv ${levelNumber}`;
}

function endGame(won, reason) {
    gameState = 'ended';
    const screen = document.getElementById('game-over-screen');
    document.getElementById('go-title').textContent = won ? '🏆 Level Complete!' : '💀 Game Over';
    document.getElementById('go-score').textContent = won
        ? `Score: ${score} coins · ${starScore} stars · ${DIFFICULTY[selectedDifficulty].label} (×${DIFFICULTY[selectedDifficulty].rewardMultiplier} rewards)`
        : reason || 'You fell off the world!';
    screen.classList.add('active');
    audioManager?.playSFX(won ? 'win' : 'fail');
    if (won) levelNumber++;
}

// --- Physics & game loop ---
function updatePhysics(dt) {
    if (gameState !== 'playing') return;

    const speed = PHYSICS.RUN_SPEED;
    if (moveLeft) {
        velocity.x = -speed;
        facingDir = -1;
    } else if (moveRight) {
        velocity.x = speed;
        facingDir = 1;
    } else {
        velocity.x *= 0.8;
    }

    velocity.y -= PHYSICS.GRAVITY * dt;

    player.position.x += velocity.x * dt;
    player.position.y += velocity.y * dt;

    // Platform collision
    isGrounded = false;
    const playerBox = new THREE.Box3().setFromObject(player);
    // Shrink box slightly for forgiving collisions
    playerBox.min.x += 0.15;
    playerBox.max.x -= 0.15;

    for (const plat of platforms) {
        if (!plat.userData.isPlatform) continue;
        const platBox = new THREE.Box3().setFromObject(plat);
        const pData = plat.userData;

        // AABB overlap check
        if (playerBox.max.x > platBox.min.x && playerBox.min.x < platBox.max.x &&
            playerBox.max.y > platBox.min.y && playerBox.min.y < platBox.max.y) {

            // Landing on top
            const feetY = player.position.y - 1;
            const platTop = pData.y + pData.h;
            if (velocity.y <= 0 && feetY >= platTop - 0.3 && player.position.x + 0.3 > pData.x && player.position.x - 0.3 < pData.x + pData.w) {
                player.position.y = platTop + 1;
                velocity.y = 0;
                isGrounded = true;
            }
        }
    }

    // Fall death
    if (player.position.y < -10) {
        endGame(false, 'You fell into the abyss!');
        return;
    }

    // Goal check
    if (player.position.x >= levelData.goalX - 0.5) {
        endGame(true);
        return;
    }

    // Collectibles
    collectItems(coins, 'isCoin', 'coin', c => {
        score += c.userData.value || 1;
        audioManager?.playSFX('coin');
    });
    collectItems(stars, 'isStar', 'star', s => {
        starScore += s.userData.value || 3;
        audioManager?.playSFX('hava');
    });

    // Enemy collision
    for (const enemy of enemies) {
        if (!enemy.userData.isEnemy) continue;
        const dist = player.position.distanceTo(enemy.position);
        if (dist < 0.9) {
            // Stomp from above
            if (velocity.y < 0 && player.position.y > enemy.position.y + 0.3) {
                scene.remove(enemy);
                enemies.splice(enemies.indexOf(enemy), 1);
                velocity.y = PHYSICS.JUMP_VELOCITY * 0.6;
                score += Math.ceil(2 * levelData.rewardMultiplier);
                audioManager?.playSFX('coin');
            } else {
                endGame(false, 'An enemy got you!');
                return;
            }
        }
    }

    // Animate collectibles
    coins.forEach(c => { if (!c.userData.collected) c.rotation.z += dt * 3; });
    stars.forEach(s => { if (!s.userData.collected) { s.rotation.y += dt * 2; s.position.y += Math.sin(Date.now() * 0.003) * 0.002; } });

    // Enemy patrol
    for (const enemy of enemies) {
        const ud = enemy.userData;
        enemy.position.x += ud.speed * ud.direction * dt;
        if (enemy.position.x <= ud.patrolMin) { ud.direction = 1; enemy.rotation.y = -Math.PI / 2; }
        if (enemy.position.x >= ud.patrolMax) { ud.direction = -1; enemy.rotation.y = Math.PI / 2; }
        if (ud.mixer) ud.mixer.update(dt);
    }

    // Camera follow
    const targetX = player.position.x + 4;
    camera.position.x += (targetX - camera.position.x) * 0.08;
    camera.position.y += (player.position.y + 3 - camera.position.y) * 0.05;
    camera.lookAt(camera.position.x - 4, camera.position.y, 0);

    // Animation
    modelManager.updateAnimation({
        isMoving: Math.abs(velocity.x) > 0.5,
        isGrounded,
        isSprinting: false,
        verticalVelocity: velocity.y,
        isGliding: false,
        facingDirection: facingDir,
    });

    updateHUD();
}

function collectItems(arr, flag, type, onCollect) {
    for (let i = arr.length - 1; i >= 0; i--) {
        const item = arr[i];
        if (item.userData.collected) continue;
        if (player.position.distanceTo(item.position) < 1.2) {
            item.userData.collected = true;
            scene.remove(item);
            arr.splice(i, 1);
            onCollect(item);
        }
    }
}

let lastTime = 0;
function animate(time = 0) {
    requestAnimationFrame(animate);
    const dt = Math.min((time - lastTime) / 1000, 0.05);
    lastTime = time;

    if (gameState === 'playing') updatePhysics(dt);
    modelManager?.update(dt);
    renderer.render(scene, camera);
}

init();
