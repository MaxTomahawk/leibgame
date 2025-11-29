import * as THREE from 'three';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/GLTFLoader.js';
import { setDoc, doc, deleteDoc, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";


let otherPlayers = {};

function listenToPlayers(scene, userId, ui, db) {
    const playersRef = collection(db, "players");
    const loader = new GLTFLoader();

    ui.peers.innerText = "1";

    onSnapshot(playersRef, (snap) => {
        const now = Date.now();
        const activePlayerIds = new Set();

        snap.forEach(docSnap => {
            const id = docSnap.id;
            if (id === userId) return;

            activePlayerIds.add(id);

            const data = docSnap.data();
            console.log(`[Firebase] Player ID: ${id}`, data);

            const appearance = data.player_appearance || { model: null, scale: 1 };
            console.log(`[Firebase] Player appearance for ${id}:`, appearance);

            if (!otherPlayers[id]) {
                // Create a container for the player
                const container = new THREE.Object3D();
                container.position.set(data.x, data.y, data.z);
                scene.add(container);

                // Name label
                const label = createNameLabel(data.name || "Onbekend");
                label.position.set(0, 2.5, 0);
                container.add(label);

                // Mesh (GLB or fallback box)
                if (appearance.model) {
                    console.log(`[Loader] Loading model for ${id}:`, appearance.model);
                    loader.load(
                        appearance.model,
                        (gltf) => {
                            console.log(`[Loader] Model loaded for ${id}`);
                            const mesh = gltf.scene;
                            mesh.scale.set(appearance.scale, appearance.scale, appearance.scale);
                            mesh.rotation.y = data.rot || 0;
                            container.add(mesh);

                            // Setup animations for other players
                            let mixer = null;
                            let animations = {};
                            if (gltf.animations && gltf.animations.length > 0) {
                                mixer = new THREE.AnimationMixer(mesh);

                                const ANIMATION_MAPPING = {
                                    'assets/option2.glb': { idle: 10, run: 0, jump: 9 },
                                    'assets/medieval_luuk.glb': { idle: 5, run: 2, jump: 0 },
                                    'assets/leib.glb': { idle: 7, run: 2, jump: 6 }
                                };
                                const mapping = ANIMATION_MAPPING[appearance.model] || ANIMATION_MAPPING['assets/option2.glb'];

                                animations = {
                                    idle: mixer.clipAction(gltf.animations[mapping.idle] || gltf.animations[0]),
                                    run: mixer.clipAction(gltf.animations[mapping.run] || gltf.animations[0]),
                                    jump: mixer.clipAction(gltf.animations[mapping.jump] || gltf.animations[0])
                                };

                                for (const action of Object.values(animations)) {
                                    action.setLoop(THREE.LoopRepeat);
                                }

                                const initialAnim = data.currentAnimation || 'idle';
                                if (animations[initialAnim]) {
                                    animations[initialAnim].play();
                                }
                            }

                            otherPlayers[id] = {
                                container,
                                mesh,
                                label,
                                lastSeen: now,
                                mixer,
                                animations,
                                currentAnimation: data.currentAnimation || 'idle',
                                currentModel: appearance.model // ✅ Track current model
                            };
                        },
                        (progress) => {
                            if (progress.total > 0) {
                                const percent = Math.round(progress.loaded / progress.total * 100);
                                console.log(`[Loader] ${id} loading: ${percent}%`);
                            }
                        },
                        (err) => {
                            console.warn(`[Loader] Failed for ${id}, using fallback`, err);
                            const mesh = new THREE.Mesh(
                                new THREE.BoxGeometry(1, 2, 1),
                                new THREE.MeshStandardMaterial({ color: 0xff0000 })
                            );
                            container.add(mesh);
                            otherPlayers[id] = { 
                                container, 
                                mesh, 
                                label, 
                                lastSeen: now,
                                currentModel: appearance.model 
                            };
                        }
                    );
                } else {
                    const mesh = new THREE.Mesh(
                        new THREE.BoxGeometry(1, 2, 1),
                        new THREE.MeshStandardMaterial({ color: 0xff0000 })
                    );
                    container.add(mesh);
                    otherPlayers[id] = { 
                        container, 
                        mesh, 
                        label, 
                        lastSeen: now,
                        currentModel: null 
                    };
                }
            } else {
                const player = otherPlayers[id];
                
                // ✅ FIX 1: Check if model changed - if so, reload the player
                if (appearance.model !== player.currentModel) {
                    console.log(`🔄 Model changed for ${id}, reloading...`);
                    
                    // Remove old container completely
                    if (player.container) {
                        scene.remove(player.container);
                        
                        // Dispose of old resources
                        player.container.traverse((child) => {
                            if (child.isMesh) {
                                if (child.geometry) child.geometry.dispose();
                                if (child.material) {
                                    if (Array.isArray(child.material)) {
                                        child.material.forEach(m => m.dispose());
                                    } else {
                                        child.material.dispose();
                                    }
                                }
                            }
                        });
                    }
                    
                    // Delete from tracking
                    delete otherPlayers[id];
                    
                    // The next snapshot will recreate them with the new model
                    return;
                }
                
                // Smooth position update
                player.container.position.lerp(new THREE.Vector3(data.x, data.y, data.z), 0.3);
                if (player.mesh) player.mesh.rotation.y = data.rot || 0;
                player.lastSeen = now;

                // Update animation if changed
                const newAnim = data.currentAnimation || 'idle';
                if (player.animations && newAnim !== player.currentAnimation) {
                    if (player.animations[player.currentAnimation]) {
                        player.animations[player.currentAnimation].fadeOut(0.2);
                    }
                    if (player.animations[newAnim]) {
                        player.animations[newAnim].reset().fadeIn(0.2).play();
                        player.currentAnimation = newAnim;
                    }
                }
            }
        });

        // Remove players who are no longer in the database OR are stale
        for (const [id, player] of Object.entries(otherPlayers)) {
            const isStale = now - player.lastSeen > 5000;
            const notInDatabase = !activePlayerIds.has(id);

            if (notInDatabase || isStale) {
                console.log(`🗑️ Removing player ${id} (notInDB: ${notInDatabase}, stale: ${isStale})`);
                if (player.container) {
                    scene.remove(player.container);
                    
                    // Properly dispose resources
                    player.container.traverse((child) => {
                        if (child.isMesh) {
                            if (child.geometry) child.geometry.dispose();
                            if (child.material) {
                                if (Array.isArray(child.material)) {
                                    child.material.forEach(m => m.dispose());
                                } else {
                                    child.material.dispose();
                                }
                            }
                        }
                    });
                }
                delete otherPlayers[id];
            }
        }

        // Also delete stale players from Firebase (cleanup duty)
        snap.docs.forEach(docSnap => {
            const id = docSnap.id;
            if (id === userId) return;

            const data = docSnap.data();
            const timeSinceUpdate = now - (data.lastUpdate || 0);

            if (timeSinceUpdate > 10000) {
                console.log(`🧹 Cleaning up stale Firebase entry for ${id}`);
                deleteDoc(doc(db, "players", id)).catch(err => {
                    console.warn("Could not delete stale player:", err);
                });
            }
        });

        ui.peers.innerText = Object.keys(otherPlayers).length + 1;
    }, (err) => {
        console.error("Player snapshot error:", err);
        ui.status.innerHTML = "❌ Database Toegang Geweigerd!";
    });
}

function startBroadcasting(userId, myName, db, auth) {
    console.log("🎙️ startBroadcasting FUNCTION ENTERED");

    let lastSent = 0;
    let lastPos = new THREE.Vector3();
    let isWriting = false;

    try {
        const broadcastInterval = setInterval(() => {
            const player = window.player;

            if (!player) {
                console.error("❌ window.player is NULL/UNDEFINED!");
                return;
            }

            if (window.gameState === 'playing' && auth.currentUser && !isWriting) {
                const now = Date.now();
                const dist = player.position.distanceTo(lastPos);

                if (now - lastSent > 100 && (dist > 0.05 || now - lastSent > 2000)) {
                    isWriting = true;

                    setDoc(doc(db, "players", userId), {
                        name: myName,
                        x: player.position.x,
                        y: player.position.y,
                        z: player.position.z,
                        rot: player.rotation.y,
                        lastUpdate: now,
                        player_appearance: player.userData.appearance,
                        currentAnimation: player.userData.currentAnimation || 'idle'
                    }, { merge: true })
                        .then(() => {
                            isWriting = false;
                            lastSent = now;
                            lastPos.copy(player.position);
                        })
                        .catch(err => {
                            isWriting = false;
                            console.error("❌ Write failed:", err);
                        });
                }
            }
        }, 100);

        window.broadcastInterval = broadcastInterval;

    } catch (error) {
        console.error("💥 ERROR CREATING INTERVAL:", error);
    }

    window.addEventListener('beforeunload', () => {
        if (window.broadcastInterval) {
            clearInterval(window.broadcastInterval);
        }
        deleteDoc(doc(db, "players", userId)).catch(() => { });
    });
}

function createNameLabel(name) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, 256, 64);
    ctx.font = "Bold 32px Arial";
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.fillText(name, 128, 42);
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
    sprite.scale.set(4, 1, 1);
    return sprite;
}

function updateOtherPlayerAnimations(delta) {
    for (const player of Object.values(otherPlayers)) {
        if (player.mixer) {
            player.mixer.update(delta);
        }
    }
}

export { listenToPlayers, startBroadcasting, createNameLabel, updateOtherPlayerAnimations };