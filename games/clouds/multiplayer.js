import * as THREE from 'three';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/GLTFLoader.js';
import { ASSET_BASE_URL, modelKeyFromPath, modelUrlForQuality } from '../../shared/asset-config.js';

let otherPlayers = {};
let playersChannel = null;
let playersPollInterval = null;

function buildAnimationMapping () {
  const base = ASSET_BASE_URL;
  return {
    [`${base}katinka.glb`]: { idle: 10, run: 0, jump: 9 },
    [`${base}marco.glb`]: { idle: 5, run: 2, jump: 0 },
    [`${base}leib.glb`]: {
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
    [`${base}weissman.glb`]: { idle: 7, run: 2, jump: 6 }
  };
}

function qualityFromSettings () {
  try {
    const saved = localStorage.getItem('leib_settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.graphics) return parsed.graphics;
    }
  } catch (_e) { /* ignore */ }
  return 'high';
}

function remoteModelUrl (appearance) {
  if (!appearance?.model) return null;
  const quality = appearance.quality || qualityFromSettings();
  return modelUrlForQuality(appearance.model, quality);
}

async function fetchRoomPlayers (supabase, roomId, selfId) {
  const { data, error } = await supabase
    .from('room_players')
    .select('*')
    .eq('room_id', roomId);
  if (error) throw error;
  return (data || []).filter((row) => row.player_id !== selfId);
}

function listenToPlayers (scene, userId, ui, supabase, roomId) {
  const loader = new GLTFLoader();
  const ANIMATION_MAPPING = buildAnimationMapping();

  const applySnapshot = (rows) => {
    const now = Date.now();
    const activeIds = new Set();

    rows.forEach((row) => {
      const id = row.player_id;
      if (id === userId) return;
      activeIds.add(id);

      const data = {
        name: row.name,
        x: row.x,
        y: row.y,
        z: row.z,
        rot: row.rot,
        currentAnimation: row.current_animation,
        player_appearance: row.player_appearance,
        lastUpdate: row.last_update
      };
      const appearance = data.player_appearance || { model: null, scale: 1 };

      if (!otherPlayers[id]) {
        const container = new THREE.Object3D();
        container.position.set(data.x, data.y, data.z);
        scene.add(container);

        const label = createNameLabel(data.name || 'Player');
        label.position.set(0, 2.5, 0);
        container.add(label);

        if (appearance.model) {
          const remoteUrl = remoteModelUrl(appearance);
          loader.load(
            remoteUrl,
            (gltf) => {
              const mesh = gltf.scene;
              mesh.scale.set(appearance.scale, appearance.scale, appearance.scale);
              mesh.rotation.y = data.rot || 0;
              container.add(mesh);

              let mixer = null;
              const animations = {};
              if (gltf.animations?.length) {
                mixer = new THREE.AnimationMixer(mesh);
                const mapping = ANIMATION_MAPPING[appearance.model] || ANIMATION_MAPPING[`${ASSET_BASE_URL}katinka.glb`];
                for (const animName in mapping) {
                  const index = mapping[animName];
                  if (gltf.animations[index]) {
                    animations[animName] = mixer.clipAction(gltf.animations[index]);
                  }
                }
                for (const action of Object.values(animations)) {
                  action.setLoop(THREE.LoopRepeat);
                }
                const initialAnim = data.currentAnimation || 'idle';
                if (animations[initialAnim]) animations[initialAnim].play();
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
            undefined,
            () => {
              console.warn('Remote player model failed, using placeholder:', remoteUrl);
              const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(1, 2, 1),
                new THREE.MeshStandardMaterial({ color: 0xff0000 })
              );
              container.add(mesh);
              otherPlayers[id] = { container, mesh, label, lastSeen: now, currentModel: appearance.model };
            }
          );
        } else {
          const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(1, 2, 1),
            new THREE.MeshStandardMaterial({ color: 0xff0000 })
          );
          container.add(mesh);
          otherPlayers[id] = { container, mesh, label, lastSeen: now, currentModel: null };
        }
      } else {
        const player = otherPlayers[id];
        if (appearance.model && appearance.model !== player.currentModel) {
          if (player.container) scene.remove(player.container);
          delete otherPlayers[id];
          return;
        }

        player.container.position.lerp(new THREE.Vector3(data.x, data.y, data.z), 0.3);
        if (player.mesh) player.mesh.rotation.y = data.rot || 0;
        player.lastSeen = now;

        const newAnim = data.currentAnimation || 'idle';
        if (player.animations && newAnim !== player.currentAnimation) {
          if (player.animations[player.currentAnimation]) player.animations[player.currentAnimation].fadeOut(0.2);
          if (player.animations[newAnim]) {
            player.animations[newAnim].reset().fadeIn(0.2).play();
            player.currentAnimation = newAnim;
          }
        }
      }
    });

    for (const [id, player] of Object.entries(otherPlayers)) {
      const isStale = Date.now() - player.lastSeen > 15000;
      const notActive = !activeIds.has(id);
      if (notActive || isStale) {
        if (player.container) scene.remove(player.container);
        delete otherPlayers[id];
      }
    }

    if (ui?.peers) ui.peers.innerText = String(Object.keys(otherPlayers).length + 1);
  };

  const refresh = async () => {
    try {
      const rows = await fetchRoomPlayers(supabase, roomId, userId);
      applySnapshot(rows);
    } catch (err) {
      console.error('Room players refresh failed:', err);
    }
  };

  refresh();

  playersChannel = supabase
    .channel(`room_players:${roomId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'room_players',
      filter: `room_id=eq.${roomId}`
    }, () => refresh())
    .subscribe();

  playersPollInterval = setInterval(refresh, 3000);

  return () => {
    if (playersPollInterval) clearInterval(playersPollInterval);
    if (playersChannel) supabase.removeChannel(playersChannel);
  };
}

function startBroadcasting (userId, myName, supabase, roomId) {
  let lastSent = 0;
  const lastPos = new THREE.Vector3();
  let lastRot = 0;
  let lastAnim = '';
  let isWriting = false;

  const broadcastInterval = setInterval(async () => {
    const player = window.player;
    if (!player || window.gameState !== 'playing' || isWriting) return;

    const now = Date.now();
    const dist = player.position.distanceTo(lastPos);
    const rotDiff = Math.abs(player.rotation.y - lastRot);
    const animChanged = (player.userData.currentAnimation || 'idle') !== lastAnim;
    const needsUpdate = dist > 0.1 || rotDiff > 0.05 || animChanged;
    const needsHeartbeat = now - lastSent > 3000;

    if ((needsUpdate || needsHeartbeat) && now - lastSent > 100) {
      isWriting = true;
      const currentAnim = player.userData.currentAnimation || 'idle';
      const appearance = player.userData.appearance;

      const { error } = await supabase.from('room_players').upsert({
        room_id: roomId,
        player_id: userId,
        name: myName,
        x: Math.round(player.position.x * 100) / 100,
        y: Math.round(player.position.y * 100) / 100,
        z: Math.round(player.position.z * 100) / 100,
        rot: Math.round(player.rotation.y * 100) / 100,
        last_update: now,
        player_appearance: appearance,
        current_animation: currentAnim
      }, { onConflict: 'room_id,player_id' });

      isWriting = false;
      if (error) {
        console.error('Presence write failed:', error);
        return;
      }
      lastSent = now;
      lastPos.copy(player.position);
      lastRot = player.rotation.y;
      lastAnim = currentAnim;
    }
  }, 150);

  window.broadcastInterval = broadcastInterval;

  window.addEventListener('beforeunload', () => {
    clearInterval(broadcastInterval);
    supabase.from('room_players').delete().eq('room_id', roomId).eq('player_id', userId);
  });
}

function createNameLabel (name) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = 256;
  canvas.height = 64;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(0, 0, 256, 64);
  ctx.font = 'Bold 32px Arial';
  ctx.fillStyle = 'white';
  ctx.textAlign = 'center';
  ctx.fillText(name, 128, 42);
  const tex = new THREE.CanvasTexture(canvas);
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
}

function updateOtherPlayerAnimations (delta) {
  for (const player of Object.values(otherPlayers)) {
    if (player.mixer) player.mixer.update(delta);
  }
}

export {
  listenToPlayers,
  startBroadcasting,
  createNameLabel,
  updateOtherPlayerAnimations,
  modelKeyFromPath
};
