// mobile-controls.js
export class MobileControls {
    constructor() {
        this.enabled = this.isMobile();
        
        // Movement (Left Stick)
        this.move = { x: 0, y: 0 };
        this.stickCenter = { x: 0, y: 0 };
        this.touchId = null; 

        // Camera (Right Stick)
        this.look = { x: 0, y: 0 };
        this.lookCenter = { x: 0, y: 0 };
        this.lookTouchId = null;

        this.maxDragDistance = 60; // Max distance for visual joystick

        if (!this.enabled) return;

        this.uiBuilt = false;
        this.onJump = () => {};
        this.onShoot = () => {};
        this.onAbility = () => {};

        this._createStickElements();
    }

    isMobile() {
        return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    }

    _createStickElements() {
        // --- LEFT STICK (Movement) ---
        this.stickOuter = this._createStickVisual();
        this.stickInner = this.stickOuter.firstChild;

        // --- RIGHT STICK (Camera) ---
        this.lookOuter = this._createStickVisual();
        this.lookInner = this.lookOuter.firstChild;
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
            pointerEvents: "none", // Belangrijk: visueel element blokkeert geen clicks
            zIndex: 11, // Iets hoger dan de touch areas
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
        // --- TOUCH AREAS (Laag Z-Level zodat UI er boven kan) ---
        // Links (Movement)
        this.moveArea = document.createElement("div");
        Object.assign(this.moveArea.style, {
            position: "fixed",
            left: "0",
            top: "0",
            height: "100%",
            width: "50%",
            zIndex: 10, // Laag genoeg zodat Game Over screens (vaak hoger) eroverheen vallen
            touchAction: "none"
        });
        document.body.appendChild(this.moveArea);

        // Rechts (Camera)
        this.dragArea = document.createElement("div");
        Object.assign(this.dragArea.style, {
            position: "fixed",
            right: "0",
            top: "0",
            width: "50%",
            height: "100%",
            zIndex: 10,
            touchAction: "none"
        });
        document.body.appendChild(this.dragArea);

        // --- KNOPPEN (Layout update) ---
        // Jump: Rechtsonder, makkelijkst bereikbaar
        this.btnJump = this._makeButton("Jump", 40, 30); 
        
        // Shoot: Links naast Jump
        this.btnShoot = this._makeButton("Shoot", 40, 120); 

        // Ability: Iets erboven
        this.btnAbility = this._makeButton("Boost", 130, 30);
    }

    _makeButton(text, bottom, right) {
        const btn = document.createElement("div");
        btn.innerText = text;
        Object.assign(btn.style, {
            position: "fixed",
            right: right + "px",
            bottom: bottom + "px",
            width: "80px",
            padding: "15px 0",
            background: "rgba(255,255,255,0.25)",
            color: "#fff",
            textAlign: "center",
            borderRadius: "12px",
            fontSize: "18px",
            userSelect: "none",
            touchAction: "none",
            zIndex: 20 // Hoger dan touch areas, zodat je ze kunt indrukken
        });
        document.body.appendChild(btn);
        return btn;
    }

    _attachEvents() {
        // --- LEFT STICK LOGIC ---
        this.moveArea.addEventListener("touchstart", e => {
            if (this.touchId !== null) return;
            e.preventDefault();
            const touch = e.touches[e.touches.length - 1];
            this.touchId = touch.identifier;
            
            this.stickCenter = { x: touch.clientX, y: touch.clientY };
            this._showStick(this.stickOuter, this.stickInner, this.stickCenter);
            document.body.appendChild(this.stickOuter); // Add visual
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

        // --- RIGHT STICK LOGIC (Camera) ---
        this.dragArea.addEventListener("touchstart", e => {
            if (this.lookTouchId !== null) return;
            e.preventDefault();
            const touch = e.touches[e.touches.length - 1];
            this.lookTouchId = touch.identifier;

            this.lookCenter = { x: touch.clientX, y: touch.clientY };
            this._showStick(this.lookOuter, this.lookInner, this.lookCenter);
            document.body.appendChild(this.lookOuter); // Add visual
        }, { passive: false });

        this.dragArea.addEventListener("touchmove", e => {
            const touch = this._findTouch(e, this.lookTouchId);
            if (!touch) return;
            e.preventDefault();
            this.look = this._updateStickMath(touch, this.lookCenter, this.lookInner);
        }, { passive: false });

        this.dragArea.addEventListener("touchend", e => {
            if (!this._findTouch(e, this.lookTouchId)) return;
            this.look = { x: 0, y: 0 };
            this._hideStick(this.lookOuter);
            this.lookTouchId = null;
        });

        // --- BUTTONS ---
        // stopPropagation is cruciaal! Anders triggert de knop OOK de camera-stick eronder.
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

    // Helper: Find touch by ID
    _findTouch(e, id) {
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === id) return e.changedTouches[i];
        }
        return null;
    }

    // Helper: Show/Hide visuals
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

    // Helper: Calculate stick physics
    _updateStickMath(touch, center, innerElement) {
        const x = touch.clientX - center.x;
        const y = touch.clientY - center.y;
        const dist = Math.hypot(x, y);
        const clampedX = (x / dist) * Math.min(dist, this.maxDragDistance);
        const clampedY = (y / dist) * Math.min(dist, this.maxDragDistance);

        innerElement.style.left = clampedX + 45 + "px";
        innerElement.style.top = clampedY + 45 + "px";

        const mag = Math.min(1.0, dist / this.maxDragDistance);
        return {
            x: (x / dist) * mag,
            y: (y / dist) * mag
        };
    }

    update() {
        const { x, y } = this.move;
        return {
            forward: -y,
            backward: y > 0 ? y : 0,
            left: x < 0 ? -x : 0,
            right: x > 0 ? x : 0,
            lookX: this.look.x,   // Directe joystick output (-1 tot 1)
            lookY: this.look.y    // Directe joystick output (-1 tot 1)
        };
    }
}