import * as THREE from 'three';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/GLTFLoader.js';

export const MODEL_SCALES = {
    'assets/option2.glb': 0.45,
    'assets/medieval_luuk.glb': 1.3,
    'assets/leib.glb': 1,
    'assets/weissman.glb': 1.3,
};

// Indexen gebaseerd op je laatste input.
// Check console logs als animaties toch verkeerd zijn!
export const ANIMATION_MAPPING = {
    'assets/option2.glb': { idle: 10, run: 0, jump: 9 },
    'assets/medieval_luuk.glb': { idle: 5, run: 2, jump: 0 },
    'assets/leib.glb': { 
        idle: 8, 
        walk: 7, 
        run: 6, 
        jump_up: 4, 
        falling_idle: 2, 
        landing: 0, 
        walk_backwards: 9,
        strafe_left: 3, 
        strafe_right: 1,
        glide: 5
    },
    'assets/weissman.glb': { idle: 7, run: 2, jump: 6 }
};

export class ModelManager {
    constructor() {
        this.mixer = null;
        this.animations = {};
        this.currentAction = null;
        this.currentAnimation = '';
        this.loader = new GLTFLoader();
        this.playerModel = null;
        this.isLanding = false;
    }

    // Load main player model
    async loadPlayerModel(modelFile, player, callbacks = {}) {
        const { onProgress, onLoaded, onError } = callbacks;

        // --- GRAPHICS CHECK ---
        // We lezen direct de settings uit storage om dependency hell in main.js te voorkomen
        let quality = 'high'; // default
        try {
            const saved = localStorage.getItem('leib_settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.graphics) quality = parsed.graphics;
            }
        } catch(e) { console.warn("Could not read graphics setting", e); }

        // Bepaal de bestandsnaam: assets/leib.glb -> assets/leib_low.glb
        // Zorg dat je build script (uit de vorige stap) deze bestanden heeft aangemaakt!
        const actualFile = modelFile.replace('.glb', `_${quality}.glb`);
        
        console.log(`🎨 Loading graphics: ${quality} (${actualFile})`);
        // ----------------------

        return new Promise((resolve, reject) => {
            if (onProgress) onProgress("model", "🎮 Loading Model... 0%", "purple");

            this.loader.load(
                actualFile, // <--- Gebruik hier de nieuwe bestandsnaam
                (gltf) => {
                    this.playerModel = gltf.scene;

                    // Let op: we gebruiken de schaal van het ORIGINELE bestand in de mapping
                    const scale = MODEL_SCALES[modelFile] || MODEL_SCALES['assets/leib.glb'];
                    this.playerModel.scale.set(scale, scale, scale);
                    this.playerModel.rotation.y = Math.PI;
                    this.playerModel.position.y = -1.1;

                    player.add(this.playerModel);

                    player.userData.appearance = {
                        model: modelFile, // Bewaar originele naam voor logica/multiplayer sync
                        quality: quality,
                        scale: scale
                    };

                    if (gltf.animations && gltf.animations.length > 0) {
                        // Geef ook hier de originele naam mee voor de ANIMATION_MAPPING lookup
                        this.setupAnimations(gltf, modelFile); 
                        this.playAnimation('idle');
                    }

                    if (onLoaded) onLoaded("model", "✅ Model loaded!", "green");
                    resolve(this.playerModel);
                },
                (progress) => {
                    if (progress.total > 0 && onProgress) {
                        const percent = Math.round(progress.loaded / progress.total * 100);
                        onProgress("model", `🎮 Loading Model... ${percent}%`, "purple");
                    }
                },
                (error) => {
                    console.error(`Error loading model (${actualFile}):`, error);
                    
                    // Fallback: Als de _low/_high versie niet bestaat, probeer het origineel
                    if (actualFile !== modelFile) {
                        console.log("⚠️ Quality version missing, trying original file...");
                        this.loadPlayerModel(modelFile, player, callbacks).then(resolve);
                        return;
                    }

                    // Echte Fallback (groene doos)
                    const fallbackGeo = new THREE.BoxGeometry(1, 2, 1);
                    const fallbackMat = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
                    this.playerModel = new THREE.Mesh(fallbackGeo, fallbackMat);
                    player.add(this.playerModel);
                    this.addPlayerLights(player);

                    if (onError) onError("model", "⚠️ Model load failed (using fallback)", "yellow");
                    resolve(this.playerModel);
                }
            );
        });
    }

    setupAnimations(gltf, modelFile) {
        // console.log(`%c[${modelFile}] Animaties gevonden:`, "color: cyan; font-weight: bold;");
        // gltf.animations.forEach((a, i) => console.log(`Index ${i}: ${a.name}`)); // enable to see animations in console

        this.mixer = new THREE.AnimationMixer(this.playerModel);
        
        this.mixer.addEventListener('finished', (e) => this.onAnimationFinished(e));

        const mapping = ANIMATION_MAPPING[modelFile] || ANIMATION_MAPPING['assets/option2.glb'];

        this.animations = {};
        for (const animName in mapping) {
            const index = mapping[animName];
            if (gltf.animations[index]) {
                this.animations[animName] = this.mixer.clipAction(gltf.animations[index]);
            }
        }

        // Loop configuratie
        for (const [name, action] of Object.entries(this.animations)) {
            const noLoopActions = ['jump', 'jump_up', 'landing'];
            
            if (noLoopActions.includes(name)) {
                action.setLoop(THREE.LoopOnce);
                action.clampWhenFinished = true;
            } else {
                action.setLoop(THREE.LoopRepeat);
            }
        }
    }

    onAnimationFinished(e) {
        if (this.animations['landing'] && e.action === this.animations['landing']) {
            this.isLanding = false; 
        }
    }

    playAnimation(name, fadeDuration = 0.2) {
        if (!this.mixer || !this.animations[name]) return;
        
        // Als de animatie al speelt, doe niets (behalve als het een one-shot was die klaar is)
        if (this.currentAction === this.animations[name] && this.currentAction.isRunning()) return;

        const nextAction = this.animations[name];

        if (this.currentAction) {
            this.currentAction.fadeOut(fadeDuration);
        }

        nextAction.reset();
        nextAction.fadeIn(fadeDuration).play();
        this.currentAction = nextAction;
        this.currentAnimation = name;
    }

    updateAnimation(state) {
        const { isMoving, isGrounded, isSprinting, modelFile, verticalVelocity, isGliding, localVelocity } = state;
        const isLeib = modelFile === 'assets/leib.glb';
        
        // Fallback voor andere modellen (die geen strafe/glide supporten in deze code)
        if (!isLeib) return this.updateAnimationLegacy(state); 

        let nextAnim = 'idle';

        // 1. GLIDE
        if (isGliding && !isGrounded) {
            nextAnim = 'glide';
        }
        // 2. AIRBORNE
        else if (!isGrounded) {
            if (verticalVelocity > 0.5) nextAnim = 'jump_up';
            else nextAnim = 'falling_idle';
        }
        // 3. LANDING CHECK
        // Als we net uit de lucht komen, trigger landing
        else if (['falling_idle', 'jump_up', 'glide'].includes(this.currentAnimation)) {
            nextAnim = 'landing';
            this.isLanding = true;
            this.playAnimation('landing', 0.05); // Snelle impact
            return 'landing';
        }
        // Zolang landing bezig is, blijf daar
        else if (this.isLanding) {
            return 'landing';
        }
        // 4. BEWEGING OP DE GROND
        else if (isMoving) {
            // Bepaal richting op basis van localVelocity (vanuit main.js)
            // localVelocity.z < 0 = Vooruit
            // localVelocity.z > 0 = Achteruit
            // localVelocity.x > 0 = Rechts (meestal)
            // localVelocity.x < 0 = Links

            const vx = localVelocity ? localVelocity.x : 0;
            const vz = localVelocity ? localVelocity.z : 0;

            // Bepaal of we meer zijwaarts gaan dan vooruit
            if (Math.abs(vx) > Math.abs(vz)) {
                // Dominant opzij
                if (vx > 0) nextAnim = 'strafe_right';
                else nextAnim = 'strafe_left';
            } else {
                // Dominant voor/achter
                if (vz > 0.1) {
                    nextAnim = 'walk_backwards';
                } else {
                    // Vooruit
                    if (isSprinting) nextAnim = 'run';
                    else nextAnim = 'walk';
                }
            }
        } 
        // 5. STILSTAAN
        else {
            nextAnim = 'idle';
        }

        // Pas wissel toe
        if (nextAnim !== this.currentAnimation) {
            // Verschillende fade-tijden voor soepelheid
            let fadeTime = 0.2;
            if (nextAnim === 'jump_up') fadeTime = 0.1;
            
            this.playAnimation(nextAnim, fadeTime);
        }

        return this.currentAnimation;
    }

    // Oude logica voor niet-Leib modellen
    updateAnimationLegacy(state) {
        const { isMoving, isGrounded, isSprinting, moveB, modelFile } = state;
        const isWeissman = modelFile === 'assets/weissman.glb';
        let nextAnim = 'idle';

        if (!isGrounded) {
            nextAnim = 'jump';
        } else if (isMoving) {
            if (isWeissman && moveB) nextAnim = 'walk_backwards';
            else if (isWeissman && !isSprinting) nextAnim = 'walk';
            else nextAnim = 'run';
        } else {
            nextAnim = 'idle';
        }

        if (nextAnim !== this.currentAnimation) {
            this.playAnimation(nextAnim, 0.2);
        }
        return this.currentAnimation;
    }

    update(delta) {
        if (this.mixer) this.mixer.update(delta);
    }

    addPlayerLights(player) {
        const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
        keyLight.position.set(5, 10, 5);
        keyLight.castShadow = true;
        player.add(keyLight);

        const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
        fillLight.position.set(-5, 5, 5);
        player.add(fillLight);

        const backLight = new THREE.DirectionalLight(0xffffff, 0.4);
        backLight.position.set(0, 5, -5);
        player.add(backLight);

        const pointLight = new THREE.PointLight(0xffffff, 1, 10);
        pointLight.position.set(0, 3, 0);
        player.add(pointLight);
    }

    loadPreviewModel(element, modelFile) {
        if (element.previewRenderer) {
            element.removeChild(element.previewRenderer.domElement);
        }

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(50, element.clientWidth / element.clientHeight, 0.1, 100);
        camera.position.set(0, 1.5, 3);
        camera.lookAt(0, 1, 0);

        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setSize(element.clientWidth, element.clientHeight);
        // Beperk pixel ratio voor previews ook voor performance
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); 
        element.appendChild(renderer.domElement);

        const light = new THREE.DirectionalLight(0xffffff, 2.2);
        light.position.set(5, 10, 5);
        scene.add(light);
        scene.add(new THREE.AmbientLight(0xffffff, 1.2));

        // --- GRAPHICS LOGICA TOEVOEGEN ---
        let quality = 'high';
        try {
            const saved = localStorage.getItem('leib_settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.graphics) quality = parsed.graphics;
            }
        } catch(e) {}

        // Vertaal 'assets/leib.glb' naar 'assets/leib_high.glb' of '_low.glb'
        const actualFile = modelFile.replace('.glb', `_${quality}.glb`);
        // ---------------------------------

        this.loader.load(actualFile, (gltf) => {
            const container = new THREE.Object3D();
            container.add(gltf.scene);

            // Let op: we gebruiken nog steeds 'modelFile' (de originele naam) voor de schaal-lookup
            const scale = MODEL_SCALES[modelFile] || MODEL_SCALES['assets/leib.glb'];
            container.scale.set(scale, scale, scale);
            container.rotation.y = Math.PI;
            scene.add(container);

            element.previewRenderer = renderer;
            element.previewModel = container;
            element.previewScene = scene;
            element.previewCamera = camera;

            this.animatePreview(element);
        }, undefined, (error) => {
            console.warn(`Preview model failed (${actualFile}):`, error);
        });
    }

    animatePreview(element) {
        if (!element.previewModel) return;
        element.previewModel.rotation.y += 0.01;
        element.previewRenderer.render(element.previewScene, element.previewCamera);
        requestAnimationFrame(() => this.animatePreview(element));
    }

    dispose() {
        if (this.mixer) this.mixer.stopAllAction();
        if (this.playerModel) {
            this.playerModel.traverse(child => {
                if (child.isMesh) {
                    child.geometry.dispose();
                    if (child.material) child.material.dispose();
                }
            });
        }
    }
}

export function getModelAppearance(modelFile) {
    return {
        model: modelFile,
        scale: MODEL_SCALES[modelFile] || MODEL_SCALES['assets/leib.glb']
    };
}