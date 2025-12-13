import * as THREE from 'three';

export class WeatherSystem {
    constructor(scene) {
        this.scene = scene;
        this.currentWeather = 'day';
        this.ufos = [];
        this.particleSystem = null;
        this.particlesData = [];

        // Weather cycle settings
        this.cycleInterval = 25000; // 60k is 1 minute. (in milliseconds)
        this.lastCycleTime = Date.now();
        this.weatherMode = 'static'; // 'static' or 'dynamic'

        // Spawn chances
        this.nightParticleChance = 0.1; // 10% -> todo: maybe always do the particles for tripping
        this.normalParticleChance = 0.25 //25%
        this.ufoSpawnChance = 0.1; // 10%

        // Track what's currently spawned
        this.particlesSpawned = false;
        this.ufosSpawned = false;

        this.starField = null;
        this.starFieldSpawned = false;

        this.updateWeather();
    }

    /**
     * Sets the weather mode
     * @param {string} mode - 'static' or 'dynamic'
     */
    setMode(mode) {
        this.weatherMode = mode;
        console.log(`🌦️ Weather mode: ${mode}`);
    }

    /**
     * Forces a specific weather state (for static mode)
     * @param {string} weather - 'day' or 'night'
     */
    setWeather(weather) {
        this.currentWeather = weather;
        this.updateWeather();
    }

    /**
     * Main update loop - call this every frame
     * @param {number} delta - Time since last frame
     * @param {boolean} isTripping - Whether trip mode is active
     */
    update(delta, isTripping = false) {
        const now = Date.now();

        // Handle dynamic weather cycling
        if (this.weatherMode === 'dynamic' && now - this.lastCycleTime > this.cycleInterval) {
            this.cycleWeather();
            this.lastCycleTime = now;
        }

        // Animate existing weather elements
        this.animateUFOs(delta);
        this.animateParticles(delta);
    }

    /**
     * Cycles to the next weather state and spawns/despawns elements
     */
    cycleWeather() {
        // Toggle between day and night
        this.currentWeather = this.currentWeather === 'day' ? 'night' : 'day';
        console.log(`🌦️ Weather changed to: ${this.currentWeather}`);

        this.updateWeather();
    }

    /**
     * Updates weather elements based on current state
     */
    updateWeather() {
        // Handle particles (50% chance at night)
        if (this.currentWeather === 'night') {
            if (Math.random() < this.nightParticleChance) {
                this.despawnParticles(); // make sure the previous effects are removed
                this.spawnParticles();
            } else {
                this.despawnParticles();
            }
        } else {
            if (Math.random() < this.normalParticleChance) {
                this.despawnParticles(); // make sure the previous effects are removed
                this.spawnParticles('white');
            } else {
                this.despawnParticles();
            }
        }

        // Handle UFOs (10% chance regardless of time)
        if (Math.random() < this.ufoSpawnChance) {
            this.spawnUFOs();
        } else {
            this.despawnUFOs();
        }

        if (this.currentWeather === 'night') {
            if (Math.random() < 0.3) { // 30% chance for clouds? 
                this.showSkyClouds();
                this.despawnStarField();
            } else {
                this.hideSkyClouds();
                this.spawnStarField();
            }
        } else {
            this.showSkyClouds(); // Always show during day
            this.despawnStarField();
        }
    }

    /**
     * Creates and adds UFOs to the scene
     */
    spawnUFOs() {
        if (this.ufosSpawned) return;

        console.log('👽 Spawning UFOs...');
        this.ufosSpawned = true;

        for (let i = 0; i < 60; i++) {
            const ufoGroup = new THREE.Group();

            // Body
            const bodyGeo = new THREE.CylinderGeometry(1.5, 2.5, 0.6, 32, 1, true);
            const bodyMat = new THREE.MeshStandardMaterial({
                color: 0x888888,
                metalness: 0.7,
                roughness: 0.3
            });
            const body = new THREE.Mesh(bodyGeo, bodyMat);
            ufoGroup.add(body);

            // Dome
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

            // Ring
            const ringGeo = new THREE.TorusGeometry(2.5, 0.1, 16, 100);
            const ringMat = new THREE.MeshStandardMaterial({
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
            this.scene.add(ufoGroup);

            this.ufos.push({
                group: ufoGroup,
                speed: 0.5 + Math.random() * 0.5,
                pathFrequencyX: 0.2 + Math.random() * 0.3,
                pathFrequencyY: 0.1 + Math.random() * 0.2,
                pathFrequencyZ: 0.15 + Math.random() * 0.25,
                pathAmplitudeX: 20 + Math.random() * 30,
                pathAmplitudeY: 5 + Math.random() * 5,
                pathAmplitudeZ: 10 + Math.random() * 20,
                rotationSpeed: 0.1 + Math.random() * 0.2,
                startX, startY, startZ
            });
        }
    }

    /**
     * Removes UFOs from the scene
     */
    despawnUFOs() {
        if (!this.ufosSpawned) return;

        console.log('👽 Despawning UFOs...');
        this.ufosSpawned = false;

        this.ufos.forEach(ufo => {
            this.scene.remove(ufo.group);
            // Dispose geometries and materials
            ufo.group.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => mat.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
        });
        this.ufos = [];
    }

    /**
     * Creates and adds particle system to the scene
     */
    spawnParticles(color_value = Math.random()) {
        if (this.particlesSpawned) return;

        const isWhite = color_value === 'white'
        console.log('✨ Spawning particles... with color: ', color_value);
        this.particlesSpawned = true;

        const particleCount = 2500;
        const particlesGeometry = new THREE.BufferGeometry();
        const posArray = new Float32Array(particleCount * 3);
        const colorArray = new Float32Array(particleCount * 3);
        this.particlesData = [];
        const colorHelper = new THREE.Color();

        for (let i = 0; i < particleCount * 3; i += 3) {
            const x = (Math.random() - 0.5) * 300;
            const y = -10 + Math.random() * 80;
            const z = (Math.random() - 0.5) * 300 + -250;

            posArray[i] = x;
            posArray[i + 1] = y;
            posArray[i + 2] = z;

            if (isWhite) {
                // White particles - set RGB to pure white
                colorArray[i] = 1.0;
                colorArray[i + 1] = 1.0;
                colorArray[i + 2] = 1.0;
            } else {
                // Colored particles
                const hueOffset = color_value;
                colorHelper.setHSL(color_value, 1.0, 0.6);

                colorArray[i] = colorHelper.r;
                colorArray[i + 1] = colorHelper.g;
                colorArray[i + 2] = colorHelper.b;
            }

            this.particlesData.push({
                velocity: 6 + Math.random() * 55,
                hueOffset: isWhite ? null : color_value,
                isWhite: isWhite,
                idx: i
            });
        }

        particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
        particlesGeometry.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));

        const particlesMaterial = new THREE.PointsMaterial({
            size: 0.4,
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
            sizeAttenuation: true
        });

        this.particleSystem = new THREE.Points(particlesGeometry, particlesMaterial);
        this.scene.add(this.particleSystem);
    }

    /**
     * Removes particle system from the scene
     */
    despawnParticles() {
        if (!this.particlesSpawned) return;

        console.log('✨ Despawning particles...');
        this.particlesSpawned = false;

        if (this.particleSystem) {
            this.scene.remove(this.particleSystem);
            this.particleSystem.geometry.dispose();
            this.particleSystem.material.dispose();
            this.particleSystem = null;
            this.particlesData = [];
        }
    }

    /**
     * Animates UFOs
     */
    animateUFOs(delta) {
        if (!this.ufosSpawned) return;

        const time = Date.now() * 0.001;
        this.ufos.forEach(ufo => {
            const forward = ufo.speed * delta * 50;
            ufo.group.position.x = ufo.startX + Math.sin(time * ufo.pathFrequencyX) * ufo.pathAmplitudeX + forward;
            ufo.group.position.y = ufo.startY + Math.sin(time * ufo.pathFrequencyY) * ufo.pathAmplitudeY;
            ufo.group.position.z = ufo.startZ + Math.sin(time * ufo.pathFrequencyZ) * ufo.pathAmplitudeZ;
            ufo.group.rotation.y += ufo.rotationSpeed * delta;

            const ring = ufo.group.children.find(c => c.geometry && c.geometry.type === 'TorusGeometry');
            if (ring && ring.material) {
                const pulse = Math.abs(Math.sin(time * 4 + ufo.group.position.x * 0.01)) * 0.6 + 0.6;
                ring.material.opacity = Math.min(1.0, pulse);
                ring.scale.set(0.8 + pulse * 0.6, 0.8 + pulse * 0.6, 1);
            }
        });
    }

    /**
     * Animates particles
     */
    animateParticles(delta) {
        if (!this.particlesSpawned || !this.particleSystem) return;

        const positions = this.particleSystem.geometry.attributes.position.array;
        const colors = this.particleSystem.geometry.attributes.color.array;
        const time = Date.now() * 0.001;
        const colorHelper = new THREE.Color();

        for (let i = 0; i < this.particlesData.length; i++) {
            const p = this.particlesData[i];

            // Update position
            let z = positions[p.idx + 2];
            z += p.velocity * delta * 60 * 0.016;
            if (z > 120) {
                z = -240;
                positions[p.idx] = (Math.random() - 0.5) * 300;
                positions[p.idx + 1] = -10 + Math.random() * 80;
            }
            positions[p.idx + 2] = z;

            // Update color
            if (!p.isWhite) {
                const hue = (Math.sin(time * 2 + p.hueOffset) * 0.5 + 0.5);
                colorHelper.setHSL(hue, 1.0, 0.6);

                colors[p.idx] = colorHelper.r;
                colors[p.idx + 1] = colorHelper.g;
                colors[p.idx + 2] = colorHelper.b;
            }
        }

        this.particleSystem.geometry.attributes.position.needsUpdate = true;
        this.particleSystem.geometry.attributes.color.needsUpdate = true;
    }

    /**
 * Shows the sky sphere clouds
 */
    showSkyClouds() {
        const sky = this.scene.children.find(child => child.name === 'SkySphere');
        if (sky) {
            sky.visible = true;
        }
    }

    /**
     * Hides the sky sphere clouds (clear night)
     */
    hideSkyClouds() {
        const sky = this.scene.children.find(child => child.name === 'SkySphere');
        if (sky) {
            sky.visible = false;
        }
    }

    /**
     * Returns the current weather state
     */
    getCurrentWeather() {
        return this.currentWeather;
    }

    /**
     * Returns whether stars are currently visible
     */
    isStarFieldVisible() {
        return this.starFieldSpawned;
    }

    /**
 * Creates a beautiful starfield with constellations
 */
    spawnStarField() {
        if (this.starFieldSpawned) return;

        console.log('⭐ Spawning starfield...');
        this.starFieldSpawned = true;

        const starCount = 3000;
        const starsGeometry = new THREE.BufferGeometry();
        const posArray = new Float32Array(starCount * 3);
        const colorArray = new Float32Array(starCount * 3);
        const sizeArray = new Float32Array(starCount);

        // Generate random stars
        for (let i = 0; i < starCount * 3; i += 3) {
            // Spherical distribution
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);
            const radius = 400 + Math.random() * 100;

            posArray[i] = radius * Math.sin(phi) * Math.cos(theta);
            posArray[i + 1] = Math.abs(radius * Math.cos(phi)); // Only above horizon
            posArray[i + 2] = radius * Math.sin(phi) * Math.sin(theta);

            // Star colors (white to blue-white to yellow-white)
            const colorChoice = Math.random();
            if (colorChoice < 0.7) {
                // White stars (most common)
                colorArray[i] = 1.0;
                colorArray[i + 1] = 1.0;
                colorArray[i + 2] = 1.0;
            } else if (colorChoice < 0.9) {
                // Blue-white stars
                colorArray[i] = 0.8;
                colorArray[i + 1] = 0.9;
                colorArray[i + 2] = 1.0;
            } else {
                // Yellow-white stars
                colorArray[i] = 1.0;
                colorArray[i + 1] = 0.95;
                colorArray[i + 2] = 0.8;
            }

            // Varied sizes (most small, some bright)
            sizeArray[i / 3] = Math.random() < 0.9 ? 1.0 + Math.random() * 2.0 : 3.0 + Math.random() * 3.0;
        }

        starsGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
        starsGeometry.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
        starsGeometry.setAttribute('size', new THREE.BufferAttribute(sizeArray, 1));

        const starsMaterial = new THREE.PointsMaterial({
            size: 2.0,
            vertexColors: true,
            transparent: true,
            opacity: 1.0,
            sizeAttenuation: true,
            map: this.createStarTexture(),
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.starField = new THREE.Points(starsGeometry, starsMaterial);
        this.starField.name = 'StarField';
        this.scene.add(this.starField);

        // Add major constellations
        this.addConstellations();
    }

    /**
     * Creates a soft glow texture for stars
     */
    createStarTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');

        const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
        gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.8)');
        gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 32, 32);

        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }

    /**
 * Adds recognizable constellation patterns
 */
    addConstellations() {
        // Big Dipper (Ursa Major)
        const bigDipperPositions = [
            [100, 200, -300],
            [120, 210, -290],
            [140, 215, -280],
            [160, 210, -275],
            [165, 195, -270],
            [150, 180, -280],
            [130, 185, -290]
        ];

        // Orion's Belt
        const orionBeltPositions = [
            [-200, 150, -250],
            [-180, 145, -255],
            [-160, 140, -260]
        ];

        // Cassiopeia (W shape)
        const cassiopeiaPositions = [
            [250, 250, -200],
            [270, 260, -210],
            [290, 255, -220],
            [310, 265, -215],
            [330, 270, -210]
        ];

        // Sagittarius (Teapot shape)
        const sagittariusPositions = [
            [-100, 180, -350],  // Spout
            [-80, 175, -340],
            [-60, 180, -330],   // Body
            [-50, 190, -325],
            [-40, 185, -320],   // Handle
            [-30, 180, -315],
            [-50, 170, -325],   // Lid
            [-60, 180, -330]    // Back to body
        ];

        // Virgo (Maiden - simplified Y shape)
        const virgoPositions = [
            [200, 160, -280],   // Head
            [190, 150, -290],   // Body
            [180, 140, -300],   // Waist
            [170, 130, -310],   // Left leg
            [180, 140, -300],   // Back to waist
            [190, 130, -295]    // Right leg
        ];

        // Scorpio (Scorpion with curved tail)
        const scorpioPositions = [
            [-250, 170, -200],  // Head/claws
            [-240, 165, -210],
            [-230, 160, -220],  // Body
            [-220, 155, -230],
            [-210, 150, -235],
            [-200, 145, -240],  // Tail curve
            [-195, 140, -245],
            [-190, 135, -250],  // Stinger
        ];

        const constellations = [
            { name: 'Big Dipper', positions: bigDipperPositions, color: 0xffffaa },
            { name: 'Orion Belt', positions: orionBeltPositions, color: 0xaaaaff },
            { name: 'Cassiopeia', positions: cassiopeiaPositions, color: 0xffaaaa },
            { name: 'Sagittarius', positions: sagittariusPositions, color: 0xffaa55 },
            { name: 'Virgo', positions: virgoPositions, color: 0xaaffaa },
            { name: 'Scorpio', positions: scorpioPositions, color: 0xff5555 }
        ];

        constellations.forEach(constellation => {
            // Create bright stars
            constellation.positions.forEach(pos => {
                const starGeo = new THREE.SphereGeometry(1.5, 8, 8);
                const starMat = new THREE.MeshBasicMaterial({
                    color: constellation.color,
                    transparent: true,
                    opacity: 0.9
                });
                const star = new THREE.Mesh(starGeo, starMat);
                star.position.set(pos[0], pos[1], pos[2]);
                star.name = `${constellation.name}_star`;
                this.scene.add(star);
            });

            // Connect with lines
            const linePoints = constellation.positions.map(pos => new THREE.Vector3(pos[0], pos[1], pos[2]));
            const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
            const lineMat = new THREE.LineBasicMaterial({
                color: constellation.color,
                transparent: true,
                opacity: 0.3,
                linewidth: 2
            });
            const line = new THREE.Line(lineGeo, lineMat);
            line.name = `${constellation.name}_line`;
            this.scene.add(line);
        });
    }

    /**
     * Removes the starfield
     */
    despawnStarField() {
        if (!this.starFieldSpawned) return;

        console.log('⭐ Despawning starfield...');
        this.starFieldSpawned = false;

        // Remove main starfield
        if (this.starField) {
            this.scene.remove(this.starField);
            this.starField.geometry.dispose();
            this.starField.material.dispose();
            this.starField = null;
        }

        // Remove constellation stars and lines
        const toRemove = [];
        this.scene.children.forEach(child => {
            if (child.name.includes('Dipper') ||
                child.name.includes('Orion') ||
                child.name.includes('Cassiopeia') ||
                child.name.includes('Sagittarius') ||
                child.name.includes('Virgo') ||
                child.name.includes('Scorpio')) {
                toRemove.push(child);
            }
        });

        toRemove.forEach(obj => {
            this.scene.remove(obj);
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
        });
    }

    /**
     * Cleanup method
     */
    dispose() {
        this.despawnUFOs();
        this.despawnParticles();
        this.despawnStarField();
    }
}