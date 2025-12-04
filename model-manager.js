// model-manager.js
import * as THREE from 'three';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/GLTFLoader.js';

export const MODEL_SCALES = {
    'assets/option2.glb': 0.45,
    'assets/medieval_luuk.glb': 1.3,
    'assets/leib.glb': 1.3,
    'assets/weissman.glb': 1.3,
};

export const ANIMATION_MAPPING = {
    'assets/option2.glb': { idle: 10, run: 0, jump: 9 },
    'assets/medieval_luuk.glb': { idle: 5, run: 2, jump: 0 },
    'assets/leib.glb': { idle: 7, run: 2, jump: 6 },
    'assets/weissman.glb': { idle: 0, run: 1, walk: 2, walk_backwards: 3, jump: 4 }
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
        const mapping = ANIMATION_MAPPING[modelFile] || ANIMATION_MAPPING['assets/option2.glb'];

        this.animations = {};
        for (const animName in mapping) {
            const index = mapping[animName];
            if (gltf.animations[index]) {
                this.animations[animName] = this.mixer.clipAction(gltf.animations[index]);
            } else if (['run', 'idle', 'jump'].includes(animName)) {
                this.animations[animName] = this.mixer.clipAction(gltf.animations[0]);
            }
        }

        // Set looping
        for (const [name, action] of Object.entries(this.animations)) {
            if (modelFile === 'assets/weissman.glb' && name === 'jump') {
                action.setLoop(THREE.LoopOnce);
                action.clampWhenFinished = true;
            } else {
                action.setLoop(THREE.LoopRepeat);
            }
        }
    }

    playAnimation(name) {
        if (!this.mixer || !this.animations[name]) return;
        if (this.currentAction === this.animations[name] && name !== 'jump') return;

        const nextAction = this.animations[name];

        if (this.currentAction) {
            this.currentAction.fadeOut(0.2);
        }

        nextAction.reset().fadeIn(0.2).play();
        this.currentAction = nextAction;
    }

    updateAnimation(state) {
        const { isMoving, isGrounded, moveB, isSprinting, modelFile } = state;
        const isWeissman = modelFile === 'assets/weissman.glb';
        let nextAnimation = this.currentAnimation;

        if (!isGrounded) {
            nextAnimation = 'jump';
        } else if (isMoving) {
            if (isWeissman) {
                if (moveB) nextAnimation = 'walk_backwards';
                else if (isSprinting) nextAnimation = 'run';
                else nextAnimation = 'walk';
            } else {
                nextAnimation = 'run';
            }
        } else {
            nextAnimation = 'idle';
        }

        if (nextAnimation !== this.currentAnimation) {
            this.playAnimation(nextAnimation);
            this.currentAnimation = nextAnimation;
        }

        return this.currentAnimation; // Return for syncing
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