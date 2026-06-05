import * as THREE from 'three';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/DRACOLoader.js';
import { assetRegistry } from './asset-registry.js';

export class ModelManager {
    constructor(registry = assetRegistry) {
        this.registry = registry;
        this.mixer = null;
        this.animations = {};
        this.currentAction = null;
        this.currentAnimation = '';
        this.playerModel = null;
        this.isLanding = false;
        this.isAttacking = false;
        this.facingMode = 'thirdPerson'; // 'thirdPerson' | 'sideScroller'
        this.facingDirection = 1; // 1 = right, -1 = left (sideScroller)

        this.loader = new GLTFLoader();
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
        this.loader.setDRACOLoader(dracoLoader);
    }

    setFacingMode(mode) {
        this.facingMode = mode;
    }

    setFacingDirection(direction) {
        this.facingDirection = direction >= 0 ? 1 : -1;
        this.applyFacing();
    }

    applyFacing() {
        if (!this.playerModel) return;
        if (this.facingMode === 'sideScroller') {
            // Side camera at +Z: model default faces +Z after PI offset; rotate to face movement on X axis
            this.playerModel.rotation.y = this.facingDirection > 0 ? -Math.PI / 2 : Math.PI / 2;
        } else {
            this.playerModel.rotation.y = Math.PI;
        }
    }

    async loadPlayerModel(modelRef, player, callbacks = {}) {
        const { onProgress, onLoaded, onError } = callbacks;
        await this.registry.load();

        const modelId = this.registry.resolveModelId(modelRef);
        const remoteUrl = this.registry.getModelUrl(modelId);

        console.log(`🎨 Loading player model: ${modelId} → ${remoteUrl}`);

        return new Promise((resolve) => {
            if (onProgress) onProgress('model', '🎮 Loading Model... 0%', 'purple');

            this.loader.load(
                remoteUrl,
                (gltf) => {
                    this.playerModel = gltf.scene;
                    this.playerModel.scale.set(1, 1, 1);
                    this.playerModel.position.y = -1.1;
                    this.applyFacing();

                    player.add(this.playerModel);
                    player.userData.appearance = {
                        model: modelId,
                        modelRef,
                        quality: this.registry.getGraphicsQuality(),
                        scale: 1,
                    };

                    if (gltf.animations?.length > 0) {
                        this.setupAnimations(gltf);
                    }

                    if (onLoaded) onLoaded('model', '✅ Model loaded!', 'green');
                    resolve(this.playerModel);
                },
                (progress) => {
                    if (progress.total > 0 && onProgress) {
                        const percent = Math.round((progress.loaded / progress.total) * 100);
                        onProgress('model', `🎮 Loading Model... ${percent}%`, 'purple');
                    }
                },
                (error) => {
                    console.error(`Error loading model (${remoteUrl}):`, error);
                    const fallbackGeo = new THREE.BoxGeometry(1, 2, 1);
                    const fallbackMat = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
                    this.playerModel = new THREE.Mesh(fallbackGeo, fallbackMat);
                    player.add(this.playerModel);
                    this.addPlayerLights(player);
                    if (onError) onError('model', '⚠️ Model load failed', 'yellow');
                    resolve(this.playerModel);
                }
            );
        });
    }

    createUpperBodyAction(clip) {
        const excludedBones = [
            'Hips', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
            'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
        ];

        const tracks = [];
        for (let i = 0; i < clip.tracks.length; i++) {
            const trackName = clip.tracks[i].name;
            let exclude = false;
            for (const boneName of excludedBones) {
                if (trackName.includes(boneName)) {
                    exclude = true;
                    break;
                }
            }
            if (!exclude) tracks.push(clip.tracks[i]);
        }

        const upperBodyClip = new THREE.AnimationClip(`${clip.name}_UB`, clip.duration, tracks);
        return this.mixer.clipAction(upperBodyClip);
    }

    setupAnimations(gltf) {
        this.mixer = new THREE.AnimationMixer(this.playerModel);
        this.mixer.addEventListener('finished', (e) => this.onAnimationFinished(e));
        this.animations = {};

        if (!gltf.animations?.length) return;

        gltf.animations.forEach((clip) => {
            let cleanName = clip.name;
            if (cleanName.includes('|')) cleanName = cleanName.split('|').pop();
            cleanName = cleanName.split('.')[0];

            const upperBodyAnims = ['cast', 'throw', 'attack'];
            if (upperBodyAnims.includes(cleanName)) {
                this.animations[cleanName] = this.createUpperBodyAction(clip);
            } else {
                this.animations[cleanName] = this.mixer.clipAction(clip);
            }
        });

        for (const [name, action] of Object.entries(this.animations)) {
            const oneShotAnims = ['jump_up', 'landing', 'throw', 'cast', 'jump', 'attack'];
            if (['cast', 'throw', 'attack'].includes(name)) {
                action.timeScale = 1.5;
                action.setLoop(THREE.LoopOnce);
                action.clampWhenFinished = false;
                action.setEffectiveWeight(1);
            } else if (oneShotAnims.includes(name)) {
                action.setLoop(THREE.LoopOnce);
                action.clampWhenFinished = false;
            } else {
                action.setLoop(THREE.LoopRepeat);
            }
        }

        this.playAnimation('idle');
    }

    onAnimationFinished(e) {
        if (this.animations.landing && e.action === this.animations.landing) {
            this.isLanding = false;
        }
        const attackAnims = [this.animations.cast, this.animations.throw, this.animations.attack].filter(Boolean);
        if (attackAnims.some(anim => anim === e.action)) {
            this.isAttacking = false;
        }
    }

    playAnimation(name, fadeDuration = 0.2) {
        if (!this.mixer || !this.animations[name]) return;

        const nextAction = this.animations[name];
        if (this.currentAction === nextAction && nextAction.isRunning()) return;

        if (this.currentAction) this.currentAction.fadeOut(fadeDuration);

        nextAction.reset();
        nextAction.fadeIn(fadeDuration).play();
        this.currentAction = nextAction;
        this.currentAnimation = name;
    }

    triggerThrowAnimation() {
        const animName = this.animations.cast ? 'cast' : 'throw';
        const action = this.animations[animName];
        if (action) {
            this.isAttacking = true;
            action.reset();
            action.setEffectiveTimeScale(1.5);
            action.setEffectiveWeight(1);
            action.play();
            return true;
        }
        return false;
    }

    updateAnimation(state) {
        const { isMoving, isGrounded, isSprinting, verticalVelocity, isGliding, localVelocity, facingDirection } = state;

        if (facingDirection !== undefined && facingDirection !== 0) {
            this.setFacingDirection(facingDirection);
        }

        let nextAnim = 'idle';

        if (isGliding && !isGrounded) {
            nextAnim = 'glide';
        } else if (!isGrounded) {
            nextAnim = verticalVelocity > 0.5 ? 'jump_up' : 'falling_idle';
        } else if (['falling_idle', 'jump_up', 'glide'].includes(this.currentAnimation)) {
            nextAnim = 'landing';
            this.isLanding = true;
            this.playAnimation('landing', 0.05);
            return 'landing';
        } else if (this.isLanding) {
            return 'landing';
        } else if (isMoving) {
            if (this.facingMode === 'sideScroller') {
                nextAnim = isSprinting ? 'run' : 'walk';
            } else {
                const vx = localVelocity ? localVelocity.x : 0;
                const vz = localVelocity ? localVelocity.z : 0;
                if (Math.abs(vx) > Math.abs(vz)) {
                    nextAnim = vx > 0 ? 'strafe_right' : 'strafe_left';
                } else if (vz > 0.1) {
                    nextAnim = 'walk_backwards';
                } else {
                    nextAnim = isSprinting ? 'run' : 'walk';
                }
            }
        }

        if (nextAnim !== this.currentAnimation) {
            let fadeTime = 0.2;
            if (nextAnim === 'jump_up') fadeTime = 0.1;
            this.playAnimation(nextAnim, fadeTime);
        }

        return this.currentAnimation;
    }

    getProjectileSpawnPosition(playerPosition) {
        let spawnPos = new THREE.Vector3();

        if (this.playerModel) {
            let projectileNode = this.playerModel.getObjectByName('projectile_point')
                || this.playerModel.getObjectByName('mixamorig:RightHand')
                || this.playerModel.getObjectByName('RightHand');

            if (!projectileNode) {
                this.playerModel.traverse((child) => {
                    if (!projectileNode && child.name?.toLowerCase().includes('righthand')) {
                        projectileNode = child;
                    }
                });
            }

            if (projectileNode) {
                projectileNode.getWorldPosition(spawnPos);
                return spawnPos;
            }
        }

        if (this.playerModel) {
            const box = new THREE.Box3().setFromObject(this.playerModel);
            const height = box.max.y - box.min.y;
            const fallbackY = box.min.y + height * 0.7;
            const forward = new THREE.Vector3(0, 0, this.facingMode === 'sideScroller' ? this.facingDirection : 1);
            if (this.playerModel.parent) {
                forward.applyQuaternion(this.playerModel.parent.quaternion);
            }
            return new THREE.Vector3(playerPosition.x, fallbackY, playerPosition.z).add(forward);
        }

        return playerPosition.clone().add(new THREE.Vector3(0, 1.5, 0));
    }

    update(delta) {
        if (this.mixer) this.mixer.update(delta);
    }

    addPlayerLights(player) {
        const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
        keyLight.position.set(5, 10, 5);
        player.add(keyLight);
        const pointLight = new THREE.PointLight(0xffffff, 1, 10);
        pointLight.position.set(0, 3, 0);
        player.add(pointLight);
    }

    loadPreviewModel(element, modelRef) {
        if (element.previewRenderer) element.removeChild(element.previewRenderer.domElement);

        const modelId = this.registry.resolveModelId(modelRef);
        const previewUrl = this.registry.getPreviewModelUrl(modelId);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(50, element.clientWidth / element.clientHeight, 0.1, 100);
        camera.position.set(0, 1.5, 3);
        camera.lookAt(0, 1, 0);
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setSize(element.clientWidth, element.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        element.appendChild(renderer.domElement);

        const light = new THREE.DirectionalLight(0xffffff, 2.2);
        light.position.set(5, 10, 5);
        scene.add(light);
        scene.add(new THREE.AmbientLight(0xffffff, 1.2));

        this.loader.load(previewUrl, (gltf) => {
            const container = new THREE.Object3D();
            container.add(gltf.scene);
            container.scale.set(1, 1, 1);
            container.rotation.y = Math.PI;
            scene.add(container);
            element.previewRenderer = renderer;
            element.previewModel = container;
            element.previewScene = scene;
            element.previewCamera = camera;
            element.dataset.modelId = modelId;
            this.animatePreview(element);
        }, undefined, (error) => console.warn('Preview failed:', error));
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
                    child.geometry?.dispose();
                    if (child.material) child.material.dispose();
                }
            });
        }
    }
}
