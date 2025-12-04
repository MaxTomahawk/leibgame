// mobile-controls.js
// Virtual joystick + camera drag + buttons for mobile devices
export class MobileControls {
    constructor() {
        this.enabled = this.isMobile();
        this.move = { x: 0, y: 0 };
        this.lookDelta = 0;
        this.lookUpDown = 0;

        if (!this.enabled) return;

        this.uiBuilt = false;
        
        // NEW: Store the dynamic center of the joystick and the touch ID
        this.stickCenter = { x: 0, y: 0 }; 
        this.touchId = null; // Ensures only one finger controls the joystick
        this.maxDragDistance = 60; // Max distance for full speed

        this.onJump = () => {};
        this.onShoot = () => {};
        this.onAbility = () => {};
        
        // Create the visual elements of the joystick (but do not add them to the DOM yet)
        this._createStickElements();
    }

    isMobile() {
        return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    }
    
    // NEW: Creates the visual elements of the joystick
    _createStickElements() {
        // ----- LEFT JOYSTICK ELEMENTS (Invisible until touched) -----
        this.stickOuter = document.createElement("div");
        this.stickInner = document.createElement("div");
        Object.assign(this.stickOuter.style, {
            position: "absolute", // Use absolute for dynamic positioning
            width: "140px",
            height: "140px",
            borderRadius: "50%",
            background: "rgba(255,255,255,0.15)",
            touchAction: "none",
            zIndex: 9999,
            opacity: 0, // Start invisible
            transition: 'opacity 0.1s' 
        });
        Object.assign(this.stickInner.style, {
            position: "absolute",
            left: "45px",
            top: "45px",
            width: "50px",
            height: "50px",
            borderRadius: "50%",
            background: "rgba(255,255,255,0.35)"
        });
        this.stickOuter.appendChild(this.stickInner);
    }

    // Call after pressing Start
    start() {
        if (!this.enabled || this.uiBuilt) return;

        this._buildUI(); 
        this._attachEvents();
        this.uiBuilt = true;

        // Fade in only the buttons
        [this.btnJump, this.btnShoot, this.btnAbility].forEach(el => {
            el.style.opacity = 0;
            el.style.transition = 'opacity 0.3s';
            requestAnimationFrame(() => el.style.opacity = 1);
        });
    }

    _buildUI() {
        // ----- LEFT TOUCH AREA (Movement) -----
        this.moveArea = document.createElement("div");
        Object.assign(this.moveArea.style, {
            position: "fixed",
            left: "0",
            top: "0",
            height: "100%",
            width: "50%", // Use 50% for a clear half (works for both portrait and landscape)
            zIndex: 9998,
            // background: "rgba(255, 0, 0, 0.1)" // For debugging
        });
        document.body.appendChild(this.moveArea);
        
        // ----- RIGHT DRAG AREA (Camera) -----
        this.dragArea = document.createElement("div");
        Object.assign(this.dragArea.style, {
            position: "fixed",
            right: "0",
            top: "0", 
            width: "50%",
            height: "100%",
            zIndex: 9998
        });
        document.body.appendChild(this.dragArea);

        // ----- BUTTONS (No change in position) -----
        this.btnJump = this._makeButton("Jump", 90, 20);
        this.btnShoot = this._makeButton("Shoot", 90, 140);
        this.btnAbility = this._makeButton("Boost", 200, 20);
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
            zIndex: 9999
        });
        document.body.appendChild(btn);
        return btn;
    }

    _attachEvents() {
        // ----- NEW JOYSTICK LOGIC on moveArea -----

        this.moveArea.addEventListener("touchstart", e => {
            // Ignore if a touch is already active for the joystick
            if (this.touchId !== null) return;
            e.preventDefault(); 

            // Use the last touch for the joystick
            const touch = e.touches[e.touches.length - 1]; 
            this.touchId = touch.identifier;

            // 1. Set the dynamic center to the touch position
            this.stickCenter.x = touch.clientX;
            this.stickCenter.y = touch.clientY;
            
            // 2. Show the joystick at the center point
            // 70px is half of the 140px width
            this.stickOuter.style.left = (this.stickCenter.x - 70) + "px"; 
            this.stickOuter.style.top = (this.stickCenter.y - 70) + "px";
            this.stickInner.style.left = "45px";
            this.stickInner.style.top = "45px";
            
            // 3. Add to DOM and make visible
            document.body.appendChild(this.stickOuter);
            this.stickOuter.style.opacity = 1;

        }, { passive: false });

        this.moveArea.addEventListener("touchmove", e => {
            if (this.touchId === null) return;

            // Find the touch matching the joystick ID
            let currentTouch = null;
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === this.touchId) {
                    currentTouch = e.changedTouches[i];
                    break;
                }
            }
            if (!currentTouch) return;
            e.preventDefault(); 

            this._updateStickDynamic(currentTouch, this.maxDragDistance);
        }, { passive: false });

        this.moveArea.addEventListener("touchend", e => {
            let endedTouch = null;
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === this.touchId) {
                    endedTouch = e.changedTouches[i];
                    break;
                }
            }
            if (!endedTouch) return;

            // 1. Reset movement
            this.move.x = 0;
            this.move.y = 0;
            
            // 2. Hide and remove from the DOM
            this.stickOuter.style.opacity = 0;
            setTimeout(() => {
                if (this.stickOuter.parentNode === document.body) {
                    document.body.removeChild(this.stickOuter);
                }
            }, 150); // Wait briefly for the fade-out
            
            this.touchId = null;
        });

        // ----- LOOK DRAG (Right Touch Area) -----
        let lookTouchId = null;
        let lastX = null, lastY = null;

        this.dragArea.addEventListener("touchstart", e => {
            if (lookTouchId !== null) return;
            e.preventDefault(); 
            // Use the last touch for the camera
            const touch = e.touches[e.touches.length - 1];
            lookTouchId = touch.identifier;
            lastX = touch.clientX;
            lastY = touch.clientY;
        }, { passive: false });

        this.dragArea.addEventListener("touchmove", e => {
            if (lookTouchId === null) return;

            let currentTouch = null;
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === lookTouchId) {
                    currentTouch = e.changedTouches[i];
                    break;
                }
            }
            if (!currentTouch) return;
            e.preventDefault(); 
            
            const x = currentTouch.clientX;
            const y = currentTouch.clientY;

            if (lastX != null && lastY != null) {
                const dx = x - lastX;
                const dy = y - lastY;

                this.lookDelta = dx * 0.0025;
                this.lookUpDown = dy * 0.0025;
            }

            lastX = x;
            lastY = y;
        }, { passive: false });

        this.dragArea.addEventListener("touchend", e => {
            let endedTouch = null;
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === lookTouchId) {
                    endedTouch = e.changedTouches[i];
                    break;
                }
            }
            if (!endedTouch) return;
            
            lookTouchId = null;
            lastX = null;
            lastY = null;
            this.lookDelta = 0;
            this.lookUpDown = 0;
        });

        // ----- BUTTON ACTIONS (Add preventDefault to prevent buttons from triggering touches in the dragArea) -----
        this.btnJump.addEventListener("touchstart", (e) => { e.preventDefault(); this.onJump(); }, { passive: false });
        this.btnShoot.addEventListener("touchstart", (e) => { e.preventDefault(); this.onShoot(); }, { passive: false });
        this.btnAbility.addEventListener("touchstart", (e) => { e.preventDefault(); this.onAbility(); }, { passive: false });
    }

    // NEW: Dynamic update based on touch position and dynamic center
    _updateStickDynamic(touch, max) {
        // Calculate position relative to the dynamic center
        const x = touch.clientX - this.stickCenter.x;
        const y = touch.clientY - this.stickCenter.y;

        const dist = Math.hypot(x, y);

        // Clamp the position to the max DragDistance for the visual inner stick
        const clampedX = (x / dist) * Math.min(dist, max);
        const clampedY = (y / dist) * Math.min(dist, max);

        // Position the inner stick relative to the outer stick
        this.stickInner.style.left = clampedX + 45 + "px";
        this.stickInner.style.top = clampedY + 45 + "px";

        // The magnitude for speed is the distance clamped between 0 and 1
        const mag = Math.min(1.0, dist / max);
        
        // Store the normalized direction (this scales the speed from 0 to 1)
        this.move.x = (x / dist) * mag;
        this.move.y = (y / dist) * mag;
    }

    update() {
        const { x, y } = this.move;

        // Remains unchanged: this returns the movement vectors
        // The magnitude (speed scale) is embedded in -y, y>0?y:0, etc.
        return {
            forward: -y,
            backward: y > 0 ? y : 0,
            left: x < 0 ? -x : 0,
            right: x > 0 ? x : 0,
            look: this.lookDelta,
            lookUpDown: this.lookUpDown
        };
    }
}