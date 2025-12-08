// model-manager.js
import * as THREE from 'three';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/GLTFLoader.js';

export const MODEL_SCALES = {
    'assets/option2.glb': 0.45,
    'assets/medieval_luuk.glb': 1.3,
    'assets/leib.glb': 1,
    'assets/weissman.glb': 1.3,
};

export const ANIMATION_MAPPING = {
    'assets/option2.glb': { idle: 10, run: 0, jump: 9 },
    'assets/medieval_luuk.glb': { idle: 5, run: 2, jump: 0 },
    'assets/leib.glb': { 
        idle: 5, 
        walk: 4, 
        run: 3, 
        jump_up: 2, 
        falling_idle: 1, 
        landing: 0, 
        walk_backwards: 6 
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
    }

    // Load main player model
    async loadPlayerModel(modelFile, player, callbacks = {}) {
        const { onProgress, onLoaded, onError } = callbacks;

        return new Promise((resolve, reject) => {
            if (onProgress) onProgress("model", "🎮 Loading Model... 0%", "purple");

            this.loader.load(
                modelFile,
                (gltf) => {
                    this.playerModel = gltf.scene;

                    const scale = MODEL_SCALES[modelFile] || MODEL_SCALES['assets/leib.glb'];
                    this.playerModel.scale.set(scale, scale, scale);
                    this.playerModel.rotation.y = Math.PI;
                    this.playerModel.position.y = -1.1;

                    player.add(this.playerModel);

                    // Store appearance for multiplayer
                    player.userData.appearance = {
                        model: modelFile,
                        scale: scale
                    };

                    // Setup animations
                    if (gltf.animations && gltf.animations.length > 0) {
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
                    console.error('Error loading model:', error);
                    
                    // Fallback: simple box
                    const fallbackGeo = new THREE.BoxGeometry(1, 2, 1);
                    const fallbackMat = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
                    this.playerModel = new THREE.Mesh(fallbackGeo, fallbackMat);
                    player.add(this.playerModel);
                    this.addPlayerLights(player);

                    if (onError) onError("model", "⚠️ Model load failed (using fallback)", "yellow");
                    resolve(this.playerModel); // Still resolve with fallback
                }
            );
        });
    }

    setupAnimations(gltf, modelFile) {
        console.log("Animations found:", gltf.animations.map((a, i) => `${i}: ${a.name}`));

        this.mixer = new THREE.AnimationMixer(this.playerModel);
        
        // Luister naar wanneer een animatie klaar is (voor de landing)
        this.mixer.addEventListener('finished', (e) => this.onAnimationFinished(e));

        const mapping = ANIMATION_MAPPING[modelFile] || ANIMATION_MAPPING['assets/option2.glb'];

        this.animations = {};
        for (const animName in mapping) {
            const index = mapping[animName];
            if (gltf.animations[index]) {
                this.animations[animName] = this.mixer.clipAction(gltf.animations[index]);
            }
        }

        // Loop settings configureren
        for (const [name, action] of Object.entries(this.animations)) {
            // Lijst met animaties die NIET mogen loopen
            const noLoopActions = ['jump', 'jump_up', 'landing'];
            
            if (noLoopActions.includes(name)) {
                action.setLoop(THREE.LoopOnce);
                action.clampWhenFinished = true;
            } else {
                action.setLoop(THREE.LoopRepeat);
            }
        }
    }

    // Nieuwe helper om te resetten naar idle/run na een landing
    onAnimationFinished(e) {
        if (e.action === this.animations['landing']) {
            this.isLanding = false; // Landing is klaar, sta weer movement toe
            // De updateAnimation loop pakt het vanaf hier weer op
        }
    }

    playAnimation(name, fadeDuration = 0.2) {
        if (!this.mixer || !this.animations[name]) return;
        if (this.currentAction === this.animations[name] && this.currentAction.isRunning()) return;

        const nextAction = this.animations[name];

        if (this.currentAction) {
            this.currentAction.fadeOut(fadeDuration);
        }

        nextAction.reset();
        
        nextAction.fadeIn(fadeDuration).play();
        this.currentAction = nextAction;
    }

    updateAnimation(state) {
        // Zorg dat je verticalVelocity (rb.linvel().y of body.velocity.y) meegeeft in state!
        const { isMoving, isGrounded, moveB, isSprinting, modelFile, verticalVelocity } = state;
        
        // Check of we met het specifieke leib model werken
        const isLeib = modelFile === 'assets/leib.glb';
        const isWeissman = modelFile === 'assets/weissman.glb';

        let nextAnimation = this.currentAnimation;

        // --- SPRONG LOGICA VOOR LEIB ---
        if (isLeib) {
            if (this.isLanding) {
                // Als we aan het landen zijn, onderbreek dit NIET, tenzij we weer springen
                if (!isGrounded) this.isLanding = false; // Toch weer gevallen/gesprongen
                else return this.currentAnimation;
            }

            if (!isGrounded) {
                // We zweven. Gaan we omhoog of omlaag?
                if (verticalVelocity > 0.5) {
                    // Omhoog = Jump Up
                    nextAnimation = 'jump_up';
                } else {
                    // Omlaag = Falling Idle
                    // Gebruik een kleine drempelwaarde zodat hij niet flippert op de top
                    nextAnimation = 'falling_idle';
                }
            } else {
                // We staan op de grond
                
                // Waren we net aan het vallen? Dan nu landen!
                if (this.currentAnimation === 'falling_idle' || this.currentAnimation === 'jump_up') {
                    nextAnimation = 'landing';
                    this.isLanding = true; // Blokkeer movement animaties tot landing klaar is
                    this.playAnimation(nextAnimation, 0.1); // Snelle fade voor impact
                    this.currentAnimation = nextAnimation;
                    return nextAnimation;
                }

                // Normale beweging op de grond
                if (isMoving) {
                    if (moveB) nextAnimation = 'walk_backwards';
                    else if (isSprinting) nextAnimation = 'run';
                    else nextAnimation = 'walk';
                } else {
                    nextAnimation = 'idle';
                }
            }
        } 
        // --- OUDE LOGICA (voor fallback/andere models) ---
        else {
             if (!isGrounded) {
                nextAnimation = 'jump';
            } else if (isMoving) {
                if (isWeissman && moveB) nextAnimation = 'walk_backwards';
                else if (isWeissman && !isSprinting) nextAnimation = 'walk'; // Weissman specifieke walk
                else nextAnimation = 'run';
            } else {
                nextAnimation = 'idle';
            }
        }

        // Als de animatie verandert, speel hem af
        if (nextAnimation !== this.currentAnimation) {
            // Pas de fade duration aan: sneller reageren bij jump/land, trager bij walk/run
            const transitionSpeed = (nextAnimation === 'jump_up' || nextAnimation === 'landing') ? 0.1 : 0.2;
            
            this.playAnimation(nextAnimation, transitionSpeed);
            this.currentAnimation = nextAnimation;
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

    // Load preview model for character selection
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
        element.appendChild(renderer.domElement);

        const light = new THREE.DirectionalLight(0xffffff, 2.2);
        light.position.set(5, 10, 5);
        scene.add(light);
        scene.add(new THREE.AmbientLight(0xffffff, 1.2));

        this.loader.load(modelFile, (gltf) => {
            const container = new THREE.Object3D();
            container.add(gltf.scene);

            const scale = MODEL_SCALES[modelFile] || MODEL_SCALES['assets/leib.glb'];
            container.scale.set(scale, scale, scale);
            container.rotation.y = Math.PI;
            scene.add(container);

            element.previewRenderer = renderer;
            element.previewModel = container;
            element.previewScene = scene;
            element.previewCamera = camera;

            this.animatePreview(element);
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