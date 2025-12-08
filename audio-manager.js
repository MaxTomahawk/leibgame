// audio-manager.js
import * as THREE from 'three';

export class AudioManager {
    constructor(camera) {
        this.listener = new THREE.AudioListener();
        camera.add(this.listener);
        
        this.musicSound = new THREE.Audio(this.listener); // Voor BGM (mp3)
        this.sfxMap = new Map(); // Voor losse effecten (wav)
        this.audioLoader = new THREE.AudioLoader();
        
        this.volumes = { master: 1, music: 1, sfx: 1 };
    }

    async load(key, path) {
        return new Promise((resolve, reject) => {
            this.audioLoader.load(path, (buffer) => {
                // Als het een mp3 is (achtergrondmuziek), zetten we hem op de musicSound
                if (path.endsWith('.mp3')) {
                    this.musicSound.setBuffer(buffer);
                    this.musicSound.setLoop(true);
                    this.musicSound.setVolume(0.5); // Start volume
                } else {
                    // Anders is het SFX (wav)
                    this.sfxMap.set(key, buffer);
                }
                resolve();
            }, undefined, reject);
        });
    }

    playMusic(key) {
        if (this.musicSound.buffer && !this.musicSound.isPlaying) {
            this.musicSound.play();
        }
    }

    playSFX(key) {
        if (this.sfxMap.has(key)) {
            const sound = new THREE.Audio(this.listener);
            sound.setBuffer(this.sfxMap.get(key));
            // Bereken volume: Master * SFX
            sound.setVolume(this.volumes.master * this.volumes.sfx);
            sound.play();
        }
    }

    updateVolumes(settings) {
        // Input is 0-100, Three.js wil 0.0-1.0
        this.volumes.master = settings.master / 100;
        this.volumes.music = settings.music / 100;
        this.volumes.sfx = settings.sfx / 100;

        this.listener.setMasterVolume(this.volumes.master);
        
        // Music is apart kanaal, dus die updaten we direct
        // Het effectieve volume van music is Master * Music
        if(this.musicSound) {
            this.musicSound.setVolume(this.volumes.music);
        }
    }
}