// mobile-controls.js
export class MobileControls {
    constructor() {
        this.enabled = this.isMobile();
        
        // --- Configuration ---
        this.maxDragDistance = 60; 
        this.touchSensitivity = 0.008; 
        this.doubleTapDelay = 300; // Time in ms for a double tap

        // --- State Movement (Left) ---
        this.move = { x: 0, y: 0 };
        this.stickCenter = { x: 0, y: 0 };
        this.moveTouchId = null; 

        // --- State Camera (Right) ---
        this.lookDelta = { x: 0, y: 0 };
        this.lastLookPos = { x: 0, y: 0 };
        this.lookTouchId = null;

        // --- State Double Tap ---
        this.lastTapTime = 0;

        if (!this.enabled) return;

        this.uiBuilt = false;
        this.onJump = () => {};
        this.onShoot = () => {};
        this.onAbility = () => {};

        this.stickOuter = this._createStickVisual();
        this.stickInner = this.stickOuter.firstChild;
    }

    isMobile() {
        return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    }

    _createStickVisual() {
        const outer = document.createElement("div");
        const inner = document.createElement("div");
        Object.assign(outer.style, {
            position: "absolute", width: "140px", height: "140px",
            borderRadius: "50%", background: "rgba(255,255,255,0.15)",
            touchAction: "none", pointerEvents: "none", zIndex: 11,
            opacity: 0, transition: 'opacity 0.1s'
        });
        Object.assign(inner.style, {
            position: "absolute", left: "45px", top: "45px",
            width: "50px", height: "50px", borderRadius: "50%",
            background: "rgba(255,255,255,0.35)"
        });
        outer.appendChild(inner);
        return outer;
    }

    start() {
        if (!this.enabled || this.uiBuilt) return;
        this._buildUI();
        this._attachEvents();
        this.uiBuilt = true;

        [this.btnShoot, this.btnAbility].forEach(el => {
            el.style.opacity = 0;
            el.style.transition = 'opacity 0.3s';
            setTimeout(() => el.style.opacity = 1, 50);
        });
    }

    _buildUI() {
        const header = document.querySelector('.ui-container');
        const headerHeight = header ? header.offsetHeight : 0;
        
        // 1. Left zone (Movement)
        this.moveArea = document.createElement("div");
        Object.assign(this.moveArea.style, {
            position: "fixed",
            left: "0",
            top: headerHeight + "px",
            width: "50%",
            height: `calc(100% - ${headerHeight}px)`,
            zIndex: 10,
            touchAction: "none"
        });
        document.body.appendChild(this.moveArea);

        // 2. Right zone (Camera + Double Tap)
        this.dragArea = document.createElement("div");
        Object.assign(this.dragArea.style, {
            position: "fixed",
            right: "0",
            top: headerHeight + "px",
            width: "50%",
            height: `calc(100% - ${headerHeight}px)`,
            zIndex: 10,
            touchAction: "none"
        });
        document.body.appendChild(this.dragArea);

        // 3. Buttons (Unified)
        this.btnShoot = this._makeButton("💥", 130, 120);
        this.btnAbility = this._makeButton("🍃", 210, 55);
    }

    _makeButton(text, bottom, right) {
        const btn = document.createElement("div");
        btn.innerText = text;
        Object.assign(btn.style, {
            position: "fixed", right: right + "px", bottom: bottom + "px",
            width: "70px", height: "70px", lineHeight: "70px",
            background: "rgba(0,0,0,0.4)", color: "#fff", textAlign: "center",
            borderRadius: "50%", fontSize: "35px", userSelect: "none",
            touchAction: "none", zIndex: 20, cursor: "pointer",
            boxShadow: "0px 4px 5px rgba(0,0,0,0.2)",
            webkitTapHighlightColor: "transparent"
        });
        document.body.appendChild(btn);
        return btn;
    }

    _attachEvents() {
        // --- LEFT STICK ---
        this.moveArea.addEventListener("touchstart", e => {
            if (this.moveTouchId !== null) return;
            e.preventDefault();
            const touch = e.changedTouches[0];
            this.moveTouchId = touch.identifier;
            this.stickCenter = { x: touch.clientX, y: touch.clientY };
            this._updateStickVisual(touch.clientX, touch.clientY);
            document.body.appendChild(this.stickOuter); 
            requestAnimationFrame(() => this.stickOuter.style.opacity = 1);
        }, { passive: false });

        this.moveArea.addEventListener("touchmove", e => {
            const touch = this._findTouch(e, this.moveTouchId);
            if (!touch) return;
            e.preventDefault();
            this._updateStickMath(touch.clientX, touch.clientY);
            this._updateStickVisual(touch.clientX, touch.clientY);
        }, { passive: false });

        this.moveArea.addEventListener("touchend", e => {
            if (!this._findTouch(e, this.moveTouchId)) return;
            this.move = { x: 0, y: 0 };
            this.stickOuter.style.opacity = 0;
            setTimeout(() => {
                if (this.stickOuter.parentNode === document.body) document.body.removeChild(this.stickOuter);
            }, 150);
            this.moveTouchId = null;
        });

        // --- RIGHT ZONE (Camera + Double Tap) ---
        
        // Added `isButton` parameter to ignore double tap logic when pressing UI buttons
        const handleLookStart = (touch, isButton = false) => {
            if (this.lookTouchId !== null) return;
            this.lookTouchId = touch.identifier;
            this.lastLookPos = { x: touch.clientX, y: touch.clientY };
            
            // CHECK DOUBLE TAP (Only if it's NOT a button press)
            if (!isButton) {
                const now = Date.now();
                if (now - this.lastTapTime < this.doubleTapDelay) {
                    // Double tap detected -> JUMP!
                    this.onJump();
                    this.lastTapTime = 0; // Reset to prevent triple tap
                    
                    // Visual feedback for double tap (optional)
                    const feedback = document.createElement("div");
                    Object.assign(feedback.style, {
                        position: "absolute", left: (touch.clientX - 25) + "px", top: (touch.clientY - 25) + "px",
                        width: "50px", height: "50px", borderRadius: "50%",
                        background: "rgba(255, 255, 255, 0.5)", pointerEvents: "none", zIndex: 30,
                        animation: "ping 0.3s ease-out forwards"
                    });
                    
                    if (typeof feedback.animate === 'function') {
                         feedback.animate([
                            { transform: 'scale(0.5)', opacity: 1 },
                            { transform: 'scale(1.5)', opacity: 0 }
                        ], { duration: 300 });
                    }
                    
                    document.body.appendChild(feedback);
                    setTimeout(() => {
                        if (feedback.parentNode) document.body.removeChild(feedback);
                    }, 300);

                } else {
                    this.lastTapTime = now;
                }
            }
        };

        const handleLookMove = (touch) => {
            if (touch.identifier !== this.lookTouchId) return;
            const dx = touch.clientX - this.lastLookPos.x;
            const dy = touch.clientY - this.lastLookPos.y;
            this.lookDelta.x += dx;
            this.lookDelta.y += dy;
            this.lastLookPos = { x: touch.clientX, y: touch.clientY };
        };

        const handleLookEnd = (touch) => {
            if (touch.identifier === this.lookTouchId) {
                this.lookTouchId = null;
            }
        };

        // Background Events (isButton defaults to false, so double tap works here)
        this.dragArea.addEventListener("touchstart", e => { 
             e.preventDefault(); 
             handleLookStart(e.changedTouches[0], false); 
        }, {passive: false});
        
        this.dragArea.addEventListener("touchmove", e => {
             e.preventDefault();
             for (let i=0; i<e.changedTouches.length; i++) handleLookMove(e.changedTouches[i]);
        }, {passive: false});
        
        this.dragArea.addEventListener("touchend", e => {
             e.preventDefault();
             for (let i=0; i<e.changedTouches.length; i++) handleLookEnd(e.changedTouches[i]);
        });

        // Button Events (pass isButton = true to skip double tap logic)
        const bindBtn = (btn, action) => {
            btn.addEventListener("touchstart", e => {
                e.preventDefault();
                e.stopPropagation();
                btn.style.transform = "scale(0.9)";
                btn.style.background = "rgba(0,0,0,0.6)";
                action();
                
                // Start looking, but indicate this is a BUTTON press (true)
                handleLookStart(e.changedTouches[0], true); 
            }, {passive: false});
            
            btn.addEventListener("touchmove", e => {
                e.preventDefault(); 
                for (let i=0; i<e.changedTouches.length; i++) handleLookMove(e.changedTouches[i]);
            }, {passive: false});
            
            btn.addEventListener("touchend", e => {
                e.preventDefault();
                btn.style.transform = "scale(1.0)";
                btn.style.background = "rgba(0,0,0,0.4)";
                for (let i=0; i<e.changedTouches.length; i++) handleLookEnd(e.changedTouches[i]);
            });
        };

        bindBtn(this.btnShoot, () => this.onShoot());
        bindBtn(this.btnAbility, () => this.onAbility());
    }

    _findTouch(e, id) {
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === id) return e.changedTouches[i];
        }
        return null;
    }

    _updateStickVisual(clientX, clientY) {
        this.stickOuter.style.left = (this.stickCenter.x - 70) + "px";
        this.stickOuter.style.top = (this.stickCenter.y - 70) + "px";
        const x = clientX - this.stickCenter.x;
        const y = clientY - this.stickCenter.y;
        const dist = Math.hypot(x, y);
        const scale = dist > this.maxDragDistance ? this.maxDragDistance / dist : 1;
        this.stickInner.style.left = (x * scale + 45) + "px";
        this.stickInner.style.top = (y * scale + 45) + "px";
    }

    _updateStickMath(clientX, clientY) {
        const x = clientX - this.stickCenter.x;
        const y = clientY - this.stickCenter.y;
        const dist = Math.hypot(x, y);
        const mag = Math.min(1.0, dist / this.maxDragDistance);
        if (dist < 0.001) { this.move = { x: 0, y: 0 }; }
        else { this.move = { x: (x / dist) * mag, y: (y / dist) * mag }; }
    }

    update() {
        const { x, y } = this.move;
        const currentLookDelta = { ...this.lookDelta };
        this.lookDelta = { x: 0, y: 0 }; 
        return {
            forward: -y,
            backward: y > 0 ? y : 0,
            left: x < 0 ? -x : 0,
            right: x > 0 ? x : 0,
            lookDeltaX: currentLookDelta.x,
            lookDeltaY: currentLookDelta.y,
            sensitivity: this.touchSensitivity
        };
    }
}