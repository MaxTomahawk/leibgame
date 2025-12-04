// audio-manager.js
import * as THREE from 'three';

export class AudioManager {
    constructor(camera) {
        // 1. The 'Ears': Create an AudioListener and add it to the camera
        this.listener = new THREE.AudioListener();
        camera.add(this.listener);

        // 2. The Loader: To load audio files
        this.audioLoader = new THREE.AudioLoader();

        // 3. Storage: Keep track of loaded buffers and active sounds
        this.buffers = {}; // Stores the raw audio data
        this.musicChannel = new THREE.Audio(this.listener); // Dedicated channel for BGM
        this.sfxVolume = 1.0;
        this.musicVolume = 0.5;
    }

    // Load a sound file and store it with a unique key
    load(key, path) {
        return new Promise((resolve, reject) => {
            this.audioLoader.load(path, (buffer) => {
                this.buffers[key] = buffer;
                console.log(`Audio loaded: ${key}`);
                resolve(buffer);
            }, undefined, (err) => {
                console.error(`Error loading audio ${path}:`, err);
                reject(err);
            });
        });
    }

    // Play background music (loops automatically, stops previous music)
    playMusic(key) {
        if (!this.buffers[key]) {
            console.warn(`Music not found: ${key}`);
            return;
        }

        // Check if music is already playing
        if (this.musicChannel.isPlaying) {
            this.musicChannel.stop();
        }

        this.musicChannel.setBuffer(this.buffers[key]);
        this.musicChannel.setLoop(true); // Music should loop
        this.musicChannel.setVolume(this.musicVolume);
        this.musicChannel.play();
    }

    stopMusic() {
        if (this.musicChannel.isPlaying) {
            this.musicChannel.stop();
        }
    }

    // Play a sound effect (fire and forget, can overlap)
    playSFX(key) {
        if (!this.buffers[key]) {
            console.warn(`SFX not found: ${key}`);
            return;
        }

        // Create a new Audio object for every SFX so they can overlap
        // (e.g. rapid fire shooting)
        const sfx = new THREE.Audio(this.listener);
        sfx.setBuffer(this.buffers[key]);
        sfx.setLoop(false);
        sfx.setVolume(this.sfxVolume);
        sfx.play();
    }
}