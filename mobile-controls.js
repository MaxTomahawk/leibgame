// mobile-controls.js
export class MobileControls {
    constructor() {
        this.enabled = this.isMobile();
        
        // --- Configuration ---
        this.maxDragDistance = 60; // Maximale uitslag van de virtuele joystick
        this.touchSensitivity = 0.004; // Gevoeligheid van de camera (wordt gebruikt in main.js)

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
        // Simpele check, kan uitgebreid worden indien nodig
        return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    }

    // Creëert de HTML-elementen voor de virtuele joystick
    _createStickVisual() {
        const outer = document.createElement("div");
        const inner = document.createElement("div");
        
        // Stijl voor de buitenste ring
        Object.assign(outer.style, {
            position: "absolute",
            width: "140px",
            height: "140px",
            borderRadius: "50%",
            background: "rgba(255,255,255,0.15)",
            touchAction: "none",      // Voorkomt standaard browser scrollen/zoomen
            pointerEvents: "none",    // BELANGRIJK: Laat touches door naar de moveArea eronder
            zIndex: 11,               // Net boven de touch area (10)
            opacity: 0,               // Start onzichtbaar
            transition: 'opacity 0.1s'
        });

        // Stijl voor de binnenste knop
        Object.assign(inner.style, {
            position: "absolute",
            left: "45px", // (140 - 50) / 2 centrerend
            top: "45px",
            width: "50px",
            height: "50px",
            borderRadius: "50%",
            background: "rgba(255,255,255,0.35)"
        });

        outer.appendChild(inner);
        return outer;
    }

    // Wordt aangeroepen vanuit main.js als het spel start
    start() {
        if (!this.enabled || this.uiBuilt) return;

        this._buildUI();
        this._attachEvents();
        this.uiBuilt = true;

        // Fade-in effect voor de knoppen
        [this.btnJump, this.btnShoot, this.btnAbility].forEach(el => {
            el.style.opacity = 0;
            el.style.transition = 'opacity 0.3s';
            // setTimeout om zeker te zijn dat de initiële opacity 0 is toegepast
            setTimeout(() => el.style.opacity = 1, 50);
        });
    }

    _buildUI() {
        // --- 1. TOUCH AREAS (Achtergrondlagen - Z-Index 10) ---
        
        // Linkerhelft voor bewegen
        this.moveArea = document.createElement("div");
        Object.assign(this.moveArea.style, {
            position: "fixed", left: "0", top: "0", height: "100%", width: "50%",
            zIndex: 10, touchAction: "none",
            // background: "rgba(255,0,0,0.1)" // Uncomment voor debug (rode gloed)
        });
        document.body.appendChild(this.moveArea);

        // Rechterhelft voor camera
        this.dragArea = document.createElement("div");
        Object.assign(this.dragArea.style, {
            position: "fixed", right: "0", top: "0", width: "50%", height: "100%",
            zIndex: 10, touchAction: "none",
            // background: "rgba(0,255,0,0.1)" // Uncomment voor debug (groene gloed)
        });
        document.body.appendChild(this.dragArea);

        // --- 2. KNOPPEN (Voorgrondlagen - Z-Index 20) ---
        // Geplaatst in een ergonomische boog rechtsonder.

        // Jump (⬆️): 
        this.btnJump = this._makeButton("⬆️", 30, 100); 
        
        // Shoot (💥): 
        this.btnShoot = this._makeButton("💥", 110, 75); 

        // Ability (🍃):
        this.btnAbility = this._makeButton("🍃", 180, 50);
    }

    // Helper om een knop te maken
    _makeButton(text, bottom, right) {
        const btn = document.createElement("div");
        btn.innerText = text;
        Object.assign(btn.style, {
            position: "fixed",
            right: right + "px",
            bottom: bottom + "px",
            width: "70px",  
            height: "70px", 
            lineHeight: "70px",     // Centreert emoji verticaal
            background: "rgba(0,0,0,0.4)", // Iets donkerdere, transparante cirkel
            color: "#fff",
            textAlign: "center",
            borderRadius: "50%",    // Volledige cirkel
            fontSize: "35px",       // Grote emoji
            userSelect: "none",     // Voorkomt selecteren van tekst
            touchAction: "none",
            zIndex: 20,             // Hoger dan de dragArea, zodat hij klikbaar is
            boxShadow: "0px 4px 5px rgba(0,0,0,0.2)", // Subtiele schaduw voor diepte
            cursor: "pointer",
            webkitTapHighlightColor: "transparent" // Verwijdert flits op Android bij tikken
        });
        document.body.appendChild(btn);
        return btn;
    }

    _attachEvents() {
        // --- A. LEFT STICK LOGIC (Dynamische Joystick) ---
        this.moveArea.addEventListener("touchstart", e => {
            // Als we al een vinger volgen voor movement, negeer nieuwe touches
            if (this.moveTouchId !== null) return;
            e.preventDefault();

            const touch = e.touches[e.touches.length - 1];
            this.moveTouchId = touch.identifier;
            
            // Zet het middelpunt van de joystick op de plek van aanraking
            this.stickCenter = { x: touch.clientX, y: touch.clientY };
            this._updateStickVisual(touch.clientX, touch.clientY);
            document.body.appendChild(this.stickOuter); // Voeg visueel element toe
            // Korte timeout zorgt voor soepele fade-in
            requestAnimationFrame(() => this.stickOuter.style.opacity = 1);
        }, { passive: false });

        this.moveArea.addEventListener("touchmove", e => {
            const touch = this._findTouch(e, this.moveTouchId);
            if (!touch) return;
            e.preventDefault();
            // Update de wiskunde (output) en de visuals
            this._updateStickMath(touch.clientX, touch.clientY);
            this._updateStickVisual(touch.clientX, touch.clientY);
        }, { passive: false });

        this.moveArea.addEventListener("touchend", e => {
            if (!this._findTouch(e, this.moveTouchId)) return;
            // Reset
            this.move = { x: 0, y: 0 };
            this.stickOuter.style.opacity = 0;
            // Verwijder uit DOM na fade-out
            setTimeout(() => {
                if (this.stickOuter.parentNode === document.body) document.body.removeChild(this.stickOuter);
            }, 150);
            this.moveTouchId = null;
        });

        // --- B. RIGHT DRAG LOGIC (Camera Delta Tracking) ---
        this.dragArea.addEventListener("touchstart", e => {
            if (this.lookTouchId !== null) return;
            // e.preventDefault() NIET aanroepen hier, anders werken de knoppen erboven soms niet goed.
            const touch = e.touches[e.touches.length - 1];
            this.lookTouchId = touch.identifier;
            // Startpositie vastleggen voor delta-berekening
            this.lastLookPos = { x: touch.clientX, y: touch.clientY };
            this.lookDelta = { x: 0, y: 0 };
        }, { passive: true }); // Passive true is vaak beter voor scroll/drag performance

        this.dragArea.addEventListener("touchmove", e => {
            const touch = this._findTouch(e, this.lookTouchId);
            if (!touch) return;
            e.preventDefault(); // Hier wel preventDefault om scrollen te voorkomen

            if (this.lastLookPos.x !== null) {
                // Bereken verschil (delta) sinds vorig frame
                this.lookDelta.x = touch.clientX - this.lastLookPos.x;
                this.lookDelta.y = touch.clientY - this.lastLookPos.y;
            }
            // Update laatste positie voor het volgende frame
            this.lastLookPos = { x: touch.clientX, y: touch.clientY };
        }, { passive: false });

        this.dragArea.addEventListener("touchend", e => {
            if (!this._findTouch(e, this.lookTouchId)) return;
            // Reset
            this.lookDelta = { x: 0, y: 0 };
            this.lastLookPos = { x: null, y: null };
            this.lookTouchId = null;
        });

        // --- C. BUTTONS LOGIC ---
        // We gebruiken een helper om de events te binden.
        // `stopPropagation` is CRUCIAAL: het voorkomt dat een tik op de knop 
        // ook wordt geregistreerd als een 'drag' op de dragArea eronder.
        const bindBtn = (btn, action) => {
            btn.addEventListener("touchstart", (e) => {
                e.preventDefault();
                e.stopPropagation(); 
                // Korte visuele feedback (indrukken)
                btn.style.transform = "scale(0.9)";
                btn.style.background = "rgba(0,0,0,0.6)";
                action();
            }, { passive: false });

            btn.addEventListener("touchend", (e) => {
                 // Reset visuele feedback
                 btn.style.transform = "scale(1.0)";
                 btn.style.background = "rgba(0,0,0,0.4)";
            });
        };

        bindBtn(this.btnJump, () => this.onJump());
        bindBtn(this.btnShoot, () => this.onShoot());
        bindBtn(this.btnAbility, () => this.onAbility());
    }

    // --- Helpers ---

    // Zoekt een specifieke touch in de lijst van actieve touches
    _findTouch(e, id) {
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === id) return e.changedTouches[i];
        }
        return null;
    }

    // Updatet de positie van de visuele stick
    _updateStickVisual(clientX, clientY) {
        // Zet de buitenste ring op het startpunt
        this.stickOuter.style.left = (this.stickCenter.x - 70) + "px";
        this.stickOuter.style.top = (this.stickCenter.y - 70) + "px";

        // Bereken de positie van de binnenste knop ten opzichte van het centrum
        const x = clientX - this.stickCenter.x;
        const y = clientY - this.stickCenter.y;
        const dist = Math.hypot(x, y);
        
        // Beperk de uitslag tot maxDragDistance
        const scale = dist > this.maxDragDistance ? this.maxDragDistance / dist : 1;
        const clampedX = x * scale;
        const clampedY = y * scale;

        // 45 is de offset om de inner stick (50x50) te centreren in de outer (140x140)
        this.stickInner.style.left = (clampedX + 45) + "px";
        this.stickInner.style.top = (clampedY + 45) + "px";
    }

    // Berekent de genormaliseerde bewegingsvector (-1.0 tot 1.0)
    _updateStickMath(clientX, clientY) {
        const x = clientX - this.stickCenter.x;
        const y = clientY - this.stickCenter.y;
        const dist = Math.hypot(x, y);
        
        // Snelheid is 1.0 bij maxDragDistance of meer
        const mag = Math.min(1.0, dist / this.maxDragDistance);
        
        // Voorkom delen door nul als dist 0 is
        if (dist < 0.001) {
             this.move = { x: 0, y: 0 };
        } else {
             this.move = { 
                 x: (x / dist) * mag, 
                 y: (y / dist) * mag 
             };
        }
    }

    // Wordt elke frame aangeroepen door main.js
    update() {
        const { x, y } = this.move;
        
        // We sturen de deltas terug voor de camera en resetten ze direct.
        // Dit zorgt ervoor dat de camera stopt zodra je vinger stopt.
        const currentLookDelta = { ...this.lookDelta };
        this.lookDelta = { x: 0, y: 0 }; 

        return {
            // Movement output (snelheid en richting)
            forward: -y, // Y is negatief naar boven op scherm
            backward: y > 0 ? y : 0,
            left: x < 0 ? -x : 0,
            right: x > 0 ? x : 0,
            
            // Camera output (pixels bewogen sinds vorig frame)
            lookDeltaX: currentLookDelta.x,
            lookDeltaY: currentLookDelta.y,
            
            // Configuratie meegeven
            sensitivity: this.touchSensitivity
        };
    }
}