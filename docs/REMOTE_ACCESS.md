# Remote access (Tailscale + SSH)

Play and develop over **Tailscale** from Termius (SSH) or a phone browser. Bind servers to **`0.0.0.0`** so Tailscale IPs can reach them.

## Ports

| Service | Port | URL (replace `<tailscale-ip>`) |
|---------|------|--------------------------------|
| **Leibgame** (HTTP) | **8000** | `http://<tailscale-ip>:8000/` |
| **ComfyUI** (art pipeline) | **8188** | `http://<tailscale-ip>:8188/` |

On Tailscale/LAN the game uses **`/assets/`** from the local junction (full mirror). Supabase uses **dev** automatically on private IPs.

Override if needed: `?assets=/assets/` · `?supabase=dev`

---

## One-time: assets junction (SSH on Windows)

Run once per machine after clone (from `C:` drive):

```cmd
cd /d "C:\Code\Leibgame Master Folder\leibgame"
rmdir assets 2>nul
del assets 2>nul
mklink /J assets "..\leibgame-assets\assets"
dir assets\leib_high.glb
```

If `assets` is a symlink file (not junction), use `del assets` instead of `rmdir`.

---

## Termius / SSH snippets

### Start Leibgame (foreground)

```cmd
cd /d "C:\Code\Leibgame Master Folder\leibgame"
python -m http.server 8000 --bind 0.0.0.0
```

Open **`http://<your-tailscale-ip>:8000`** → hub → Leib Clouds.

### Start Leibgame (background, close SSH safely)

```cmd
cd /d "C:\Code\Leibgame Master Folder\leibgame"
start /B python -m http.server 8000 --bind 0.0.0.0 > server-8000.log 2>&1
echo Leibgame on :8000
```

Stop: `taskkill /F /IM python.exe /FI "WINDOWTITLE eq *"` or find PID with `netstat -ano | findstr :8000`.

### Start ComfyUI (art pipeline)

```cmd
cd /d D:\Code\ComfyUI
python main.py --listen 0.0.0.0 --port 8188
```

Background:

```cmd
cd /d D:\Code\ComfyUI
start /B python main.py --listen 0.0.0.0 --port 8188 > comfyui-8188.log 2>&1
```

Set for pipeline over Tailscale:

```cmd
set COMFYUI_HOST=<your-tailscale-ip>
set COMFYUI_PORT=8188
```

Or run generate from the **same machine** as ComfyUI with default `127.0.0.1:8188`.

### Full dev stack (two SSH tabs)

**Tab 1 — game**

```cmd
cd /d "C:\Code\Leibgame Master Folder\leibgame" && python -m http.server 8000 --bind 0.0.0.0
```

**Tab 2 — ComfyUI** (when doing art)

```cmd
cd /d D:\Code\ComfyUI && python main.py --listen 0.0.0.0 --port 8188
```

---

## GitHub Pages (production)

| Site | URL |
|------|-----|
| Game | `https://maxtomahawk.github.io/leibgame/` |
| Assets CDN | `https://maxtomahawk.github.io/leibgame-assets/assets/` |

**Asset split on Pages:** `*_low.glb` ship inside the game repo; medium/high/ultra + audio load from the assets CDN.

Deploy: push to **`main`** → GitHub Actions workflow **`Deploy GitHub Pages`** runs automatically.

**One-time GitHub setup (each repo):** Settings → Pages → Build and deployment → **Source: GitHub Actions**.

---

## PowerShell helper scripts

From repo root:

```powershell
.\scripts\start-server.ps1          # game :8000
.\scripts\start-server.ps1 -Port 8000 -Bind 0.0.0.0
```

See also [`WORKSPACE.md`](WORKSPACE.md) and [`../leibgame-pipeline/docs/PIPELINE_GUIDE.md`](../leibgame-pipeline/docs/PIPELINE_GUIDE.md).
