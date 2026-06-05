import * as THREE from 'three';
import { generateLeibJumpLevel } from './leib-jump-level.js';
import { getTextureUrl } from './asset-library.js';

const SIDE_Z = 0;
const PLAYER_HALF_HEIGHT = 1.1;
const CAMERA_DISTANCE = 24;

export class LeibJumpGame {
    constructor({
        scene,
        camera,
        player,
        modelManager,
        uiManager,
        audioManager,
        onCoins,
        onStars,
        onComplete,
        onFail
    }) {
        this.scene = scene;
        this.camera = camera;
        this.player = player;
        this.modelManager = modelManager;
        this.uiManager = uiManager;
        this.audioManager = audioManager;
        this.onCoins = onCoins;
        this.onStars = onStars;
        this.onComplete = onComplete;
        this.onFail = onFail;

        this.group = new THREE.Group();
        this.group.name = 'LeibJumpLevel';
        this.scene.add(this.group);

        this.raycaster = new THREE.Raycaster();
        this.down = new THREE.Vector3(0, -1, 0);
        this.velocity = new THREE.Vector3();
        this.platformMeshes = [];
        this.coinMeshes = [];
        this.enemyMeshes = [];
        this.finishMarker = null;
        this.isGrounded = false;
        this.active = false;
        this.facing = 1;
        this.level = null;
        this.platformTexture = null;
    }

    async start(difficultyKey = 'normal') {
        this.disposeLevel();
        this.active = true;
        this.level = generateLeibJumpLevel(difficultyKey);
        this.velocity.set(0, 0, 0);
        this.isGrounded = false;
        this.facing = 1;

        await this.loadPlatformTexture();
        this.buildLevel();

        const start = this.level.platforms[0];
        this.player.position.set(start.x - 2, start.y + PLAYER_HALF_HEIGHT + start.h / 2, SIDE_Z);
        this.player.rotation.set(0, -Math.PI / 2, 0);
        this.updateCamera(1);

        if (window.ronnie) window.ronnie.visible = false;
        this.uiManager.updateStatus(
            'firebase',
            `Leib Jump! ${this.level.difficulty.label}: ${this.level.difficulty.rewardMultiplier}x rewards`,
            'green'
        );
    }

    isActive() {
        return this.active;
    }

    jump(isMaleCharacter = true) {
        if (!this.active || !this.isGrounded) return;

        this.velocity.y = 13.5;
        this.isGrounded = false;
        if (this.audioManager) {
            this.audioManager.playSFX(isMaleCharacter ? 'jump' : 'jump_female');
        }
    }

    update(delta, inputState) {
        if (!this.active || !this.level) return;

        const left = inputState.left || inputState.backward;
        const right = inputState.right || inputState.forward;
        const move = (right ? 1 : 0) - (left ? 1 : 0);
        const runSpeed = 10.5;
        const gravity = 28;

        this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, move * runSpeed, 12 * delta);
        this.velocity.y -= gravity * delta;

        this.player.position.x += this.velocity.x * delta;
        this.player.position.y += this.velocity.y * delta;
        this.player.position.z = SIDE_Z;

        if (move !== 0) {
            this.facing = Math.sign(move);
            this.player.rotation.y = this.facing > 0 ? -Math.PI / 2 : Math.PI / 2;
        }

        this.resolveGround();
        this.updateAnimation(move);
        this.updateCoins(delta);
        this.updateEnemies(delta);
        this.checkFinish();
        this.updateCamera(delta);
        this.updateProgress();

        if (this.player.position.y < -14) {
            this.fail('Leib fell below the level!');
        }
    }

    disposeLevel() {
        this.platformMeshes.length = 0;
        this.coinMeshes.length = 0;
        this.enemyMeshes.length = 0;
        this.finishMarker = null;

        while (this.group.children.length) {
            const child = this.group.children.pop();
            this.group.remove(child);
            child.traverse?.((obj) => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material && !obj.material.userData?.isShared) obj.material.dispose();
            });
        }
    }

    stop() {
        this.active = false;
        this.disposeLevel();
    }

    async loadPlatformTexture() {
        if (this.platformTexture) return;

        try {
            const url = await getTextureUrl('texture_cloud_tile');
            this.platformTexture = await new Promise((resolve) => {
                new THREE.TextureLoader().load(url, (texture) => {
                    texture.encoding = THREE.sRGBEncoding;
                    texture.wrapS = THREE.RepeatWrapping;
                    texture.wrapT = THREE.RepeatWrapping;
                    resolve(texture);
                }, undefined, () => resolve(null));
            });
        } catch (error) {
            console.warn('Leib Jump platform texture unavailable:', error);
            this.platformTexture = null;
        }
    }

    buildLevel() {
        const cloudMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.85,
            metalness: 0.05,
            map: this.platformTexture || null
        });
        cloudMaterial.userData.isShared = true;

        const coinMaterial = new THREE.MeshStandardMaterial({ color: 0xffd447, emissive: 0x4d3300 });
        coinMaterial.userData.isShared = true;
        const enemyMaterial = new THREE.MeshStandardMaterial({ color: 0xc73232, roughness: 0.6 });
        enemyMaterial.userData.isShared = true;

        this.level.platforms.forEach((platform) => {
            const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(platform.w, platform.h, 3),
                cloudMaterial
            );
            mesh.position.set(platform.x, platform.y, SIDE_Z);
            mesh.receiveShadow = true;
            mesh.castShadow = true;
            mesh.userData.platform = platform;
            this.group.add(mesh);
            this.platformMeshes.push(mesh);
        });

        this.level.coins.forEach((coin) => {
            const mesh = new THREE.Mesh(
                new THREE.TorusGeometry(0.38, 0.1, 10, 20),
                coinMaterial
            );
            mesh.position.set(coin.x, coin.y, SIDE_Z);
            mesh.rotation.y = Math.PI / 2;
            mesh.userData.coin = coin;
            this.group.add(mesh);
            this.coinMeshes.push(mesh);
        });

        this.level.enemies.forEach((enemy) => {
            const mesh = new THREE.Mesh(
                new THREE.CapsuleGeometry(0.45, 0.8, 4, 8),
                enemyMaterial
            );
            mesh.position.set(enemy.x, enemy.y, SIDE_Z);
            mesh.userData.enemy = {
                ...enemy,
                originX: enemy.x,
                direction: 1
            };
            this.group.add(mesh);
            this.enemyMeshes.push(mesh);
        });

        this.finishMarker = this.createFinishMarker();
        this.finishMarker.position.set(this.level.finish.x, this.level.finish.y + 1.8, SIDE_Z);
        this.group.add(this.finishMarker);
    }

    createFinishMarker() {
        const marker = new THREE.Group();
        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.08, 4, 12),
            new THREE.MeshStandardMaterial({ color: 0xf5f5f5 })
        );
        pole.position.y = 1;
        marker.add(pole);

        const flag = new THREE.Mesh(
            new THREE.PlaneGeometry(1.4, 0.8),
            new THREE.MeshStandardMaterial({ color: 0x5b6cff, side: THREE.DoubleSide })
        );
        flag.position.set(0.7, 2.6, 0);
        marker.add(flag);
        marker.userData.isFinish = true;
        return marker;
    }

    resolveGround() {
        const origin = this.player.position.clone().add(new THREE.Vector3(0, 1.6, 0));
        this.raycaster.set(origin, this.down);
        const hits = this.raycaster.intersectObjects(this.platformMeshes, false);
        this.isGrounded = false;

        if (hits.length > 0 && hits[0].distance < 2.9 && this.velocity.y <= 0) {
            this.player.position.y = hits[0].point.y + PLAYER_HALF_HEIGHT;
            this.velocity.y = 0;
            this.isGrounded = true;
        }
    }

    updateAnimation(move) {
        const currentAnimation = this.modelManager.updateAnimation({
            isMoving: Math.abs(move) > 0,
            isGrounded: this.isGrounded,
            isSprinting: true,
            verticalVelocity: this.velocity.y,
            isGliding: false,
            localVelocity: new THREE.Vector3(0, 0, -Math.abs(this.velocity.x))
        });

        this.player.userData.currentAnimation = currentAnimation;
    }

    updateCoins(delta) {
        for (let i = this.coinMeshes.length - 1; i >= 0; i--) {
            const coin = this.coinMeshes[i];
            coin.rotation.z += delta * 3;
            coin.position.y += Math.sin(performance.now() * 0.004 + i) * 0.002;

            if (coin.position.distanceTo(this.player.position) < 1.35) {
                const value = coin.userData.coin.value || 1;
                this.group.remove(coin);
                this.coinMeshes.splice(i, 1);
                if (this.audioManager) this.audioManager.playSFX('coin');
                this.onCoins(value);
            }
        }
    }

    updateEnemies(delta) {
        for (const enemy of this.enemyMeshes) {
            const data = enemy.userData.enemy;
            enemy.position.x += data.direction * delta * 1.6;

            if (Math.abs(enemy.position.x - data.originX) > data.patrol) {
                data.direction *= -1;
            }

            enemy.rotation.y = data.direction > 0 ? -Math.PI / 2 : Math.PI / 2;

            const distance = enemy.position.distanceTo(this.player.position);
            if (distance < 1.25) {
                if (this.velocity.y < -2 && this.player.position.y > enemy.position.y + 0.35) {
                    this.group.remove(enemy);
                    this.enemyMeshes = this.enemyMeshes.filter(item => item !== enemy);
                    this.velocity.y = 9;
                    this.onStars(this.level.difficulty.rewardMultiplier);
                    if (this.audioManager) this.audioManager.playSFX('hava');
                    return;
                }

                this.fail('Leib bumped into an enemy!');
                return;
            }
        }
    }

    checkFinish() {
        if (this.player.position.x >= this.level.finish.x - 0.5) {
            const reward = this.level.finish.reward;
            this.onCoins(reward);
            this.complete(`Leib Jump! complete: +${reward} coins (${this.level.difficulty.label})`);
        }
    }

    updateProgress() {
        const startX = this.level.platforms[0].x;
        const endX = this.level.finish.x;
        const progress = Math.max(0, Math.min(100, ((this.player.position.x - startX) / (endX - startX)) * 100));
        this.uiManager.updateHUD({ progress });
    }

    updateCamera(delta) {
        const target = new THREE.Vector3(
            this.player.position.x + 4,
            Math.max(this.player.position.y + 3, 4),
            CAMERA_DISTANCE
        );
        this.camera.position.lerp(target, Math.min(1, delta * 6));
        this.camera.lookAt(this.player.position.x + 5, this.player.position.y + 1.5, SIDE_Z);
    }

    complete(message) {
        if (!this.active) return;
        this.active = false;
        if (this.audioManager) this.audioManager.playSFX('win');
        this.onComplete(message);
    }

    fail(reason) {
        if (!this.active) return;
        this.active = false;
        if (this.audioManager) this.audioManager.playSFX('fail');
        this.onFail(reason);
    }
}
