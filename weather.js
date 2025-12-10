import * as THREE from 'three';

export class WeatherSystem {
    constructor(scene) {
        this.scene = scene;
        this.currentWeather = 'day';
        this.ufos = [];
        this.particleSystem = null;
        this.particlesData = [];
        
        // Weather cycle settings
        this.cycleInterval = 45000; // 60k is 1 minute. (in milliseconds)
        this.lastCycleTime = Date.now();
        this.weatherMode = 'static'; // 'static' or 'dynamic'
        
        // Spawn chances
        this.nightParticleChance = 0.5; // 50%
        this.ufoSpawnChance = 0.1; // 10%
        
        // Track what's currently spawned
        this.particlesSpawned = false;
        this.ufosSpawned = false;

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
                this.spawnParticles();
            } else {
                this.despawnParticles();
            }
        } else {
            this.despawnParticles();
        }

        // Handle UFOs (10% chance regardless of time)
        if (Math.random() < this.ufoSpawnChance) {
            this.spawnUFOs();
        } else {
            this.despawnUFOs();
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
    spawnParticles() {
        if (this.particlesSpawned) return;
        
        console.log('✨ Spawning particles...');
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
            const z = (Math.random() - 0.5) * 300;

            posArray[i] = x;
            posArray[i + 1] = y;
            posArray[i + 2] = z;

            const hueOffset = Math.random() * Math.PI * 2;
            colorHelper.setHSL(Math.random(), 1.0, 0.6);

            colorArray[i] = colorHelper.r;
            colorArray[i + 1] = colorHelper.g;
            colorArray[i + 2] = colorHelper.b;

            this.particlesData.push({
                velocity: 6 + Math.random() * 55,
                hueOffset: hueOffset,
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
            const hue = (Math.sin(time * 2 + p.hueOffset) * 0.5 + 0.5);
            colorHelper.setHSL(hue, 1.0, 0.6);

            colors[p.idx] = colorHelper.r;
            colors[p.idx + 1] = colorHelper.g;
            colors[p.idx + 2] = colorHelper.b;
        }

        this.particleSystem.geometry.attributes.position.needsUpdate = true;
        this.particleSystem.geometry.attributes.color.needsUpdate = true;
    }

    /**
     * Returns the current weather state
     */
    getCurrentWeather() {
        return this.currentWeather;
    }

    /**
     * Cleanup method
     */
    dispose() {
        this.despawnUFOs();
        this.despawnParticles();
    }
}