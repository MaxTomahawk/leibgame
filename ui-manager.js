// ui-manager.js

export class UIManager {
    constructor() {
        // Cache all DOM elements
        this.dom = {
            startScreen: document.getElementById('start-screen'),
            authStatus: document.getElementById('auth-status'),
            startBtn: document.getElementById('start-btn'),
            
            // Auth Forms
            loginContainer: document.getElementById('login-form-container'),
            showLoginBtn: document.getElementById('show-login-btn'),
            emailInput: document.getElementById('email-input'),
            passInput: document.getElementById('password-input'),
            linkBtn: document.getElementById('btn-link-account'),
            loginBtn: document.getElementById('btn-login'),
            logoutBtn: document.getElementById('btn-logout'),
            authError: document.getElementById('auth-error'),

            // Character Selection
            charPreviews: document.querySelectorAll('.char-preview'),
            usernameInput: document.getElementById('username-input'),

            // HUD
            uiContainer: document.querySelector('.ui-container'),
            mobileMenuBtn: document.getElementById('mobile-menu-btn'),
            coinDisplay: document.getElementById('coin-display'),
            starDisplay: document.getElementById('star-display'),
            peerCount: document.getElementById('peer-count'),
            nameDisplay: document.getElementById('player-name-display'),
            progressBar: document.getElementById('progress-bar'),
            progressFill: document.getElementById('progress-fill'),
            progressText: document.getElementById('progress-text'),
            versionDisplay: document.getElementById('version-display'),
            statusMsg: document.getElementById('status-msg'),

            // Menus
            pauseScreen: document.getElementById('pause-screen'),
            resumeBtn: document.getElementById('resume-btn'),
            restartBtn: document.getElementById('restart-btn-menu'),
            fullscreenBtn: document.getElementById('fullscreen-btn'),
            
            // Game Over
            gameOverScreen: document.getElementById('game-over-screen'),
            goReason: document.getElementById('go-reason'),
            
            // Hints
            controlsHint: document.getElementById('controls-hint')
        };

        this.statusMessages = { model: "", firebase: "" };
        
        // Bind internal UI logic (toggles that don't need main.js)
        this._bindInternalEvents();
    }

    _bindInternalEvents() {
        // Toggle Login Form
        if (this.dom.showLoginBtn) {
            this.dom.showLoginBtn.addEventListener('click', () => {
                this.dom.loginContainer.classList.toggle('hidden');
            });
        }
    }

    // --- SETUP & STATUS ---

    setVersion(commit, date) {
        if (this.dom.versionDisplay) {
            this.dom.versionDisplay.innerText = `v${commit}`;
            this.dom.versionDisplay.title = `Built: ${date}`;
        }
    }

    setControlsHint(isMobile) {
        if (!this.dom.controlsHint) return;
        if (isMobile) {
            this.dom.controlsHint.innerHTML = `
                <p><strong>Mobile Controls:</strong></p>
                <ul class="list-disc pl-4 mt-1">
                    <li>🕹️ <strong>Left Side:</strong> Joystick (Move)</li>
                    <li>👆 <strong>Right Side:</strong> Drag to look</li>
                    <li>⚡ <strong>Double Tap (Right):</strong> Jump</li>
                    <li>💥 <strong>Button:</strong> Spit</li>
                    <li>🍃 <strong>Button:</strong> Smoke</li>
                </ul>`;
        } else {
            this.dom.controlsHint.innerHTML = `
                <p><strong>PC Controls:</strong></p>
                <p>WASD (Move) | Space (Jump) | Mouse (Look) | Shift (Run) | LMB (Spit) | RMB (Smoke)</p>`;
        }
    }

    updateStatus(type, message, color) {
        this.statusMessages[type] = { text: message, color: color };
        const messages = [];
        const colors = [];

        if (this.statusMessages.model.text) {
            messages.push(this.statusMessages.model.text);
            colors.push(this.statusMessages.model.color);
        }
        if (this.statusMessages.firebase.text) {
            messages.push(this.statusMessages.firebase.text);
            colors.push(this.statusMessages.firebase.color);
        }

        const colorPriority = { red: 1, yellow: 2, purple: 3, blue: 4, green: 5 };
        const finalColor = colors.sort((a, b) => colorPriority[a] - colorPriority[b])[0] || "blue";

        const colorClasses = {
            red: "bg-red-100 text-red-800 border-red-400",
            yellow: "bg-yellow-100 text-yellow-800 border-yellow-400",
            purple: "bg-purple-100 text-purple-800 border-purple-400",
            blue: "bg-blue-100 text-blue-800 border-blue-400",
            green: "bg-green-100 text-green-800 border-green-400"
        };

        this.dom.authStatus.innerHTML = messages.join("<br>");
        this.dom.authStatus.className = `text-sm p-3 mb-4 rounded-lg border ${colorClasses[finalColor]}`;
    }

    enableStartButton() {
        this.dom.startBtn.disabled = false;
        this.dom.startBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }

    // --- EVENT BINDING ---

    onStart(callback) {
        this.dom.startBtn.addEventListener('click', () => {
            const name = this.dom.usernameInput.value.trim();
            callback(name);
        });
    }

    onCharacterSelect(callback) {
        this.dom.charPreviews.forEach(btn => {
            btn.addEventListener('click', () => {
                // UI update
                this.dom.charPreviews.forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                // Trigger callback
                callback(btn.dataset.model);
            });
        });
    }

    getCharacterPreviewElements() {
        return this.dom.charPreviews;
    }

    // Auth Callbacks
    onLogin(callback) {
        if (!this.dom.loginBtn) return;
        this.dom.loginBtn.addEventListener('click', async () => {
            this.setAuthMessage("Logging in...", "text-gray-500");
            const email = this.dom.emailInput.value;
            const pass = this.dom.passInput.value;
            try {
                await callback(email, pass);
                this.setAuthMessage("Welcome back!", "text-green-500");
                window.location.reload(); 
            } catch (err) {
                this.setAuthMessage(err.message, "text-red-500");
            }
        });
    }

    onLinkAccount(callback) {
        if (!this.dom.linkBtn) return;
        this.dom.linkBtn.addEventListener('click', async () => {
            this.setAuthMessage("Linking...", "text-gray-500");
            const email = this.dom.emailInput.value;
            const pass = this.dom.passInput.value;
            try {
                await callback(email, pass);
                this.setAuthMessage("Success! Progress Saved.", "text-green-500");
            } catch (err) {
                this.setAuthMessage(err.message, "text-red-500");
            }
        });
    }

    onLogout(callback) {
        if (!this.dom.logoutBtn) return;
        this.dom.logoutBtn.addEventListener('click', async () => {
            await callback();
        });
    }

    setAuthMessage(msg, colorClass) {
        this.dom.authError.innerText = msg;
        this.dom.authError.className = `text-xs mt-2 font-bold ${colorClass}`;
    }

    // Menu Callbacks
    onPauseToggle(callback) {
        // Mobile menu button
        this.dom.mobileMenuBtn.addEventListener('click', () => {
            const isPaused = this.dom.pauseScreen.classList.contains('active');
            callback(isPaused); // pass true if currently paused (so we resume), false if playing (so we pause)
        });
        
        // Pointer lock listener handled in main.js, or we can handle UI part here
    }

    onResume(callback) {
        this.dom.resumeBtn.addEventListener('click', callback);
    }

    onRestart(callback) {
        this.dom.restartBtn.addEventListener('click', callback);
        // Game Over restart
        const goRestart = this.dom.gameOverScreen.querySelector('button');
        if (goRestart) goRestart.addEventListener('click', callback);
    }

    onFullscreen(callback) {
        this.dom.fullscreenBtn.addEventListener('click', callback);
    }

    // --- GAME STATE UI ---

    startGameUI(playerName) {
        if(playerName) this.dom.nameDisplay.innerText = playerName;
        this.dom.startScreen.classList.remove('active');
        this.dom.progressBar.style.display = 'block';
    }

    togglePauseScreen(show) {
        if (show) {
            this.dom.pauseScreen.classList.add('active');
        } else {
            this.dom.pauseScreen.classList.remove('active');
        }
    }

    showGameOver(reason, won) {
        this.dom.goReason.innerText = reason;
        this.dom.goReason.style.color = won ? '#00ff00' : '#ff0000';
        this.dom.gameOverScreen.classList.add('active');
    }

    updateHUD(data) {
        if (data.coins !== undefined) this.dom.coinDisplay.innerText = data.coins;
        if (data.stars !== undefined) this.dom.starDisplay.innerText = data.stars;
        if (data.peers !== undefined) this.dom.peerCount.innerText = data.peers;
        if (data.progress !== undefined) {
            this.dom.progressFill.style.width = data.progress + '%';
            this.dom.progressText.innerText = Math.round(data.progress) + '%';
        }
    }

    initHUD(coins, stars) {
        this.dom.coinDisplay.innerText = coins;
        this.dom.starDisplay.innerText = stars;
    }
}