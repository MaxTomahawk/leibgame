// mobile-controls.js
export class MobileControls {
    constructor() {
        this.enabled = this.isMobile();
        
        // Movement (Left Stick - blijft hetzelfde)
        this.move = { x: 0, y: 0 };
        this.stickCenter = { x: 0, y: 0 };
        this.touchId = null; 
        this.maxDragDistance = 60;

        // Camera (Right Drag - NIEUW)
        this.lookDelta = { x: 0, y: 0 };
        this.lastLookPos = { x: null, y: null };
        this.lookTouchId = null;

        if (!this.enabled) return;

        this.uiBuilt = false;
        this.onJump = () => {};
        this.onShoot = () => {};
        this.onAbility = () => {};

        // Alleen de linker stick visueel aanmaken
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
            position: "absolute",
            width: "140px",
            height: "140px",
            borderRadius: "50%",
            background: "rgba(255,255,255,0.15)",
            touchAction: "none",
            pointerEvents: "none",
            zIndex: 11,
            opacity: 0,
            transition: 'opacity 0.1s'
        });
        Object.assign(inner.style, {
            position: "absolute",
            left: "45px",
            top: "45px",
            width: "50px",
            height: "50px",
            borderRadius: "50%",
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

        // Fade in buttons
        [this.btnJump, this.btnShoot, this.btnAbility].forEach(el => {
            el.style.opacity = 0;
            el.style.transition = 'opacity 0.3s';
            requestAnimationFrame(() => el.style.opacity = 1);
        });
    }

    _buildUI() {
        // --- TOUCH AREAS ---
        this.moveArea = document.createElement("div");
        Object.assign(this.moveArea.style, {
            position: "fixed", left: "0", top: "0", height: "100%", width: "50%",
            zIndex: 10, touchAction: "none"
        });
        document.body.appendChild(this.moveArea);

        this.dragArea = document.createElement("div");
        Object.assign(this.dragArea.style, {
            position: "fixed", right: "0", top: "0", width: "50%", height: "100%",
            zIndex: 10, touchAction: "none"
        });
        document.body.appendChild(this.dragArea);

        // --- KNOPPEN (Verticale Layout met Emojis) ---
        // We maken ze iets vierkanter en stapelen ze verticaal op rechts.
        
        // Jump (Onderop)
        this.btnJump = this._makeButton("⬆️", 30, 30); 
        
        // Shoot (Midden)
        this.btnShoot = this._makeButton("💥", 110, 30); 

        // Boost (Bovenop)
        this.btnAbility = this._makeButton("🍃", 190, 30);
    }

    _makeButton(text, bottom, right) {
        const btn = document.createElement("div");
        btn.innerText = text;
        Object.assign(btn.style, {
            position: "fixed",
            right: right + "px",
            bottom: bottom + "px",
            width: "70px",  // Iets vierkanter
            height: "70px", // Iets vierkanter
            lineHeight: "70px", // Centreren van emoji
            background: "rgba(0,0,0,0.3)", // Iets donkerder voor contrast
            color: "#fff",
            textAlign: "center",
            borderRadius: "15px", // Minder rond
            fontSize: "32px", // Grotere emoji
            userSelect: "none",
            touchAction: "none",
            zIndex: 20,
            // Simpele shadow voor diepte
            boxShadow: "0px 4px 5px rgba(0,0,0,0.2)"
        });
        document.body.appendChild(btn);
        return btn;
    }

    _attachEvents() {
        // --- LEFT STICK (Ongewijzigd) ---
        this.moveArea.addEventListener("touchstart", e => {
            if (this.touchId !== null) return;
            e.preventDefault();
            const touch = e.touches[e.touches.length - 1];
            this.touchId = touch.identifier;
            this.stickCenter = { x: touch.clientX, y: touch.clientY };
            this._showStick(this.stickOuter, this.stickInner, this.stickCenter);
            document.body.appendChild(this.stickOuter);
        }, { passive: false });

        this.moveArea.addEventListener("touchmove", e => {
            const touch = this._findTouch(e, this.touchId);
            if (!touch) return;
            e.preventDefault();
            this.move = this._updateStickMath(touch, this.stickCenter, this.stickInner);
        }, { passive: false });

        this.moveArea.addEventListener("touchend", e => {
            if (!this._findTouch(e, this.touchId)) return;
            this.move = { x: 0, y: 0 };
            this._hideStick(this.stickOuter);
            this.touchId = null;
        });

        // --- RIGHT DRAG (Vernieuwd: Delta tracking) ---
        this.dragArea.addEventListener("touchstart", e => {
            if (this.lookTouchId !== null) return;
            e.preventDefault();
            const touch = e.touches[e.touches.length - 1];
            this.lookTouchId = touch.identifier;
            // Reset de startpositie voor deze nieuwe sleepbeweging
            this.lastLookPos = { x: touch.clientX, y: touch.clientY };
            this.lookDelta = { x: 0, y: 0 };
        }, { passive: false });

        this.dragArea.addEventListener("touchmove", e => {
            const touch = this._findTouch(e, this.lookTouchId);
            if (!touch) return;
            e.preventDefault();

            if (this.lastLookPos.x !== null) {
                // Bereken verschil sinds vorig frame
                this.lookDelta.x = touch.clientX - this.lastLookPos.x;
                this.lookDelta.y = touch.clientY - this.lastLookPos.y;
            }
            // Update laatste positie voor het volgende frame
            this.lastLookPos = { x: touch.clientX, y: touch.clientY };
        }, { passive: false });

        this.dragArea.addEventListener("touchend", e => {
            if (!this._findTouch(e, this.lookTouchId)) return;
            this.lookDelta = { x: 0, y: 0 };
            this.lastLookPos = { x: null, y: null };
            this.lookTouchId = null;
        });

        // --- BUTTONS (Ongewijzigd: stopPropagation is belangrijk) ---
        const bindBtn = (btn, action) => {
            btn.addEventListener("touchstart", (e) => {
                e.preventDefault();
                e.stopPropagation(); 
                action();
            }, { passive: false });
        };
        bindBtn(this.btnJump, () => this.onJump());
        bindBtn(this.btnShoot, () => this.onShoot());
        bindBtn(this.btnAbility, () => this.onAbility());
    }

    _findTouch(e, id) {
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === id) return e.changedTouches[i];
        }
        return null;
    }

    _showStick(outer, inner, center) {
        outer.style.left = (center.x - 70) + "px";
        outer.style.top = (center.y - 70) + "px";
        inner.style.left = "45px";
        inner.style.top = "45px";
        outer.style.opacity = 1;
    }

    _hideStick(outer) {
        outer.style.opacity = 0;
        setTimeout(() => {
            if (outer.parentNode === document.body) document.body.removeChild(outer);
        }, 150);
    }

    _updateStickMath(touch, center, innerElement) {
        const x = touch.clientX - center.x;
        const y = touch.clientY - center.y;
        const dist = Math.hypot(x, y);
        const clampedX = (x / dist) * Math.min(dist, this.maxDragDistance);
        const clampedY = (y / dist) * Math.min(dist, this.maxDragDistance);

        innerElement.style.left = clampedX + 45 + "px";
        innerElement.style.top = clampedY + 45 + "px";

        const mag = Math.min(1.0, dist / this.maxDragDistance);
        return { x: (x / dist) * mag, y: (y / dist) * mag };
    }

    update() {
        const { x, y } = this.move;
        // We sturen nu de deltas terug voor de camera
        const currentLookDelta = { ...this.lookDelta };
        // Reset deltas na het uitlezen, anders blijft de camera draaien
        this.lookDelta = { x: 0, y: 0 }; 

        return {
            forward: -y,
            backward: y > 0 ? y : 0,
            left: x < 0 ? -x : 0,
            right: x > 0 ? x : 0,
            lookDeltaX: currentLookDelta.x,
            lookDeltaY: currentLookDelta.y
        };
    }
}