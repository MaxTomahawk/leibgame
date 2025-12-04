// mobile-controls.js
export class MobileControls {
    constructor() {
        this.enabled = this.isMobile();
        
        // --- Configuration ---
        this.maxDragDistance = 60; // Maximale uitslag van de virtuele joystick
        this.touchSensitivity = 0.004; // Gevoeligheid van de camera

        // --- State Movement (Links) ---
        this.move = { x: 0, y: 0 };
        this.stickCenter = { x: 0, y: 0 };
        this.moveTouchId = null; 

        // --- State Camera (Rechts) ---
        this.lookDelta = { x: 0, y: 0 };
        this.lastLookPos = { x: null, y: null };
        this.lookTouchId = null;

        if (!this.enabled) return;

        this.uiBuilt = false;
        // Callbacks die door main.js worden ingevuld
        this.onJump = () => {};
        this.onShoot = () => {};
        this.onAbility = () => {};

        // Alleen de linker stick visueel aanmaken (rechts is onzichtbaar draggen)
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

        // Fade-in effect voor de knoppen
        [this.btnJump, this.btnShoot, this.btnAbility].forEach(el => {
            el.style.opacity = 0;
            el.style.transition = 'opacity 0.3s';
            setTimeout(() => el.style.opacity = 1, 50);
        });
    }

    _buildUI() {
        // --- 1. TOUCH AREAS (Achtergrondlagen - Z-Index 10) ---
        
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

        // --- 2. KNOPPEN (Voorgrondlagen - Z-Index 20) ---
        // GECORRIGEERDE "BOOG" LAYOUT
        
        // 1. Jump (⬆️): Basis in de hoek (het ankerpunt)
        this.btnJump = this._makeButton("⬆️", 30, 30); 
        
        // 2. Shoot (💥): Links van Jump (ietsje hoger voor de curve)
        this.btnShoot = this._makeButton("💥", 50, 110); 

        // 3. Ability (🍃): Boven Jump (ietsje links voor de curve)
        // Dit corrigeert de "platte lijn" fout van de vorige versie
        this.btnAbility = this._makeButton("🍃", 120, 50);
    }

    _makeButton(text, bottom, right) {
        const btn = document.createElement("div");
        btn.innerText = text;
        Object.assign(btn.style, {
            position: "fixed",
            right: right + "px",
            bottom: bottom + "px",
            width: "70px",  
            height: "70px", 
            lineHeight: "70px",     
            background: "rgba(0,0,0,0.4)", 
            color: "#fff",
            textAlign: "center",
            borderRadius: "50%",    
            fontSize: "35px",       
            userSelect: "none",     
            touchAction: "none",
            zIndex: 20,             
            boxShadow: "0px 4px 5px rgba(0,0,0,0.2)", 
            cursor: "pointer",
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
            const touch = e.touches[e.touches.length - 1];
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

        // --- RIGHT DRAG ---
        this.dragArea.addEventListener("touchstart", e => {
            if (this.lookTouchId !== null) return;
            const touch = e.touches[e.touches.length - 1];
            this.lookTouchId = touch.identifier;
            this.lastLookPos = { x: touch.clientX, y: touch.clientY };
            this.lookDelta = { x: 0, y: 0 };
        }, { passive: true });

        this.dragArea.addEventListener("touchmove", e => {
            const touch = this._findTouch(e, this.lookTouchId);
            if (!touch) return;
            e.preventDefault(); 
            if (this.lastLookPos.x !== null) {
                this.lookDelta.x = touch.clientX - this.lastLookPos.x;
                this.lookDelta.y = touch.clientY - this.lastLookPos.y;
            }
            this.lastLookPos = { x: touch.clientX, y: touch.clientY };
        }, { passive: false });

        this.dragArea.addEventListener("touchend", e => {
            if (!this._findTouch(e, this.lookTouchId)) return;
            this.lookDelta = { x: 0, y: 0 };
            this.lastLookPos = { x: null, y: null };
            this.lookTouchId = null;
        });

        // --- BUTTONS ---
        const bindBtn = (btn, action) => {
            btn.addEventListener("touchstart", (e) => {
                e.preventDefault();
                e.stopPropagation(); 
                btn.style.transform = "scale(0.9)";
                btn.style.background = "rgba(0,0,0,0.6)";
                action();
            }, { passive: false });

            btn.addEventListener("touchend", (e) => {
                 btn.style.transform = "scale(1.0)";
                 btn.style.background = "rgba(0,0,0,0.4)";
            });
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
        if (dist < 0.001) {
             this.move = { x: 0, y: 0 };
        } else {
             this.move = { x: (x / dist) * mag, y: (y / dist) * mag };
        }
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