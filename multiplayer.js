import * as THREE from 'three';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/GLTFLoader.js';
import { setDoc, doc, deleteDoc, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";


let otherPlayers = {};
let playersUnsubscribe = null; // ✅ Store unsubscribe function

const ASSET_BASE_URL = 'https://MaxTomahawk.github.io/leibgame-assets/assets/';

function listenToPlayers(scene, userId, ui, db) {
    const playersRef = collection(db, "players");
    const loader = new GLTFLoader();

    ui.peers.innerText = "1";

    // ✅ OPTIMIZATION 1: Store the unsubscribe function so we can stop listening when needed
    playersUnsubscribe = onSnapshot(playersRef, (snap) => {
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
                    // --- NEW CODE START ---
                    
                    // Retrieve graphics settings from local storage to determine quality
                    let quality = 'high';
                    try {
                        const saved = localStorage.getItem('leib_settings');
                        if (saved) {
                            const parsed = JSON.parse(saved);
                            if (parsed.graphics) quality = parsed.graphics;
                        }
                    } catch(e) { console.warn("Could not read graphics setting", e); }

                    // Modify the filename to load the correct quality version (e.g., _high.glb or _low.glb)
                    const remoteUrl = appearance.model.replace('.glb', `_${quality}.glb`);
                    
                    console.log(`[Loader] Loading model for ${id}:`, remoteUrl);
                    
                    // --- NEW CODE END ---

                    loader.load(
                        remoteUrl, // Load the quality-specific file
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
                                        '${ASSET_BASE_URL}katinka.glb': { idle: 10, run: 0, jump: 9 },
                                        '${ASSET_BASE_URL}marco.glb': { idle: 5, run: 2, jump: 0 },
                                        '${ASSET_BASE_URL}leib.glb': { 
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
                                        '${ASSET_BASE_URL}weissman.glb': { idle: 7, run: 2, jump: 6 }
                                    };
                                    
                                    // Use the original model name for mapping logic, not the quality specific filename
                                    const mapping = ANIMATION_MAPPING[appearance.model] || ANIMATION_MAPPING['${ASSET_BASE_URL}katinka.glb'];
                                    
                                    for (const animName in mapping) {
                                        const index = mapping[animName];
                                        if (gltf.animations[index]) {
                                            animations[animName] = mixer.clipAction(gltf.animations[index]);
                                        }
                                    }

                                    for (const action of Object.values(animations)) {
                                        if (appearance.model === '${ASSET_BASE_URL}weissman.glb' && action.getClip().name === 'jump') {
                                            action.setLoop(THREE.LoopOnce);
                                            action.clampWhenFinished = true;
                                        } else {
                                            action.setLoop(THREE.LoopRepeat);
                                        }
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
                                currentModel: appearance.model
                            };
                        },
                        (progress) => {
                            // Optional: Log progress if needed
                        },
                        (err) => {
                            // Fallback logic: If the quality version fails, try loading the original file
                            if (remoteUrl !== appearance.model) {
                                console.log(`[Loader] ${remoteUrl} failed, trying original: ${appearance.model}`);
                                loader.load(appearance.model, (gltf) => {
                                    // Repeat the success logic here or extract it to a function
                                    // For now, simpler to just let it fall through to the red box if this also fails
                                    // strictly speaking, you would copy the success block here.
                                    // However, usually the Error logic below is sufficient for a quick fix.
                                    
                                    // Minimal recursive retry for visual correctness:
                                    const mesh = gltf.scene;
                                    mesh.scale.set(appearance.scale, appearance.scale, appearance.scale);
                                    container.add(mesh);
                                    otherPlayers[id] = { container, mesh, label, lastSeen: now, currentModel: appearance.model };
                                }, () => {
                                    // If original also fails, show red box
                                    console.warn(`[Loader] Failed for ${id} (both versions), using fallback box`);
                                    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial({ color: 0xff0000 }));
                                    container.add(mesh);
                                    otherPlayers[id] = { container, mesh, label, lastSeen: now, currentModel: appearance.model };
                                });
                                return;
                            }

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
                
                // Check if model changed - if so, reload the player
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
            const isStale = now - player.lastSeen > 15000; // ✅ Increased from 5s to 15s (matches Firebase cleanup)
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

        // Cleanup stale Firebase entries
        snap.docs.forEach(docSnap => {
            const id = docSnap.id;
            if (id === userId) return; // Don't delete yourself!

            const data = docSnap.data();
            const timeSinceUpdate = now - (data.lastUpdate || 0);

            if (timeSinceUpdate > 15000) { // 15 seconds = definitely gone (increased from 10s)
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
    let lastRot = 0;
    let lastAnim = '';
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
                const rotDiff = Math.abs(player.rotation.y - lastRot);
                const animChanged = (player.userData.currentAnimation || 'idle') !== lastAnim;

                // ✅ OPTIMIZATION 3: Only send updates when something meaningful changed
                // OR when heartbeat is needed (every 3 seconds instead of 2)
                const needsUpdate = dist > 0.1 || rotDiff > 0.05 || animChanged;
                const needsHeartbeat = now - lastSent > 3000; // Increased from 2s to 3s

                if ((needsUpdate || needsHeartbeat) && now - lastSent > 100) {
                    isWriting = true;

                    const currentAnim = player.userData.currentAnimation || 'idle';

                    setDoc(doc(db, "players", userId), {
                        name: myName,
                        x: Math.round(player.position.x * 100) / 100, // ✅ Round to 2 decimals
                        y: Math.round(player.position.y * 100) / 100,
                        z: Math.round(player.position.z * 100) / 100,
                        rot: Math.round(player.rotation.y * 100) / 100,
                        lastUpdate: now,
                        player_appearance: player.userData.appearance,
                        currentAnimation: currentAnim
                    }, { merge: true })
                        .then(() => {
                            isWriting = false;
                            lastSent = now;
                            lastPos.copy(player.position);
                            lastRot = player.rotation.y;
                            lastAnim = currentAnim;
                        })
                        .catch(err => {
                            isWriting = false;
                            console.error("❌ Write failed:", err);
                        });
                }
            }
        }, 150); // ✅ OPTIMIZATION 4: Reduced update frequency from 100ms to 150ms

        window.broadcastInterval = broadcastInterval;

    } catch (error) {
        console.error("💥 ERROR CREATING INTERVAL:", error);
    }

    // ✅ OPTIMIZATION 5: Better cleanup
    window.addEventListener('beforeunload', () => {
        if (window.broadcastInterval) {
            clearInterval(window.broadcastInterval);
        }
        if (playersUnsubscribe) {
            playersUnsubscribe(); // Stop listening to save reads
        }
        // Delete self from database
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