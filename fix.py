
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"

APP = PUBLIC / "app.js"
PACKAGE = ROOT / "package.json"
SERVER = ROOT / "server.js"
GAMES = ROOT / "data" / "games.json"

GAME_ORIGIN = "https://hudgames-play.onrender.com"

GAME_SERVER = r'''import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);

const gamesFile = path.join(root, "data", "games.json");

if (!fs.existsSync(gamesFile)) {
    throw new Error("data/games.json is missing.");
}

const games = JSON.parse(fs.readFileSync(gamesFile, "utf8"));

if (!Array.isArray(games)) {
    throw new Error("games.json must contain an array.");
}

const byId = new Map(games.map(g => [String(g.id), g]));

app.get("/health", (req, res) => {
    res.json({ ok: true, games: games.length });
});

app.get("/play/:id", async (req, res, next) => {
    try {
        const id = String(req.params.id);
        const game = byId.get(id);

        if (!game) {
            return res.status(404).send("Game not found.");
        }

        if (!process.env.GOOGLE_API_KEY) {
            return res.status(503).send("Google Drive API key is not configured.");
        }

        const url =
            "https://www.googleapis.com/drive/v3/files/" +
            encodeURIComponent(id) +
            "?alt=media&key=" +
            encodeURIComponent(process.env.GOOGLE_API_KEY);

        const upstream = await fetch(url);

        if (!upstream.ok) {
            const status = upstream.status === 404 ? 404 : 502;
            return res.status(status).send("Could not load game from Google Drive.");
        }

        res.setHeader(
            "Content-Type",
            upstream.headers.get("content-type") || "text/html; charset=utf-8"
        );

        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-Content-Type-Options", "nosniff");

        if (!upstream.body) {
            return res.status(502).send("Google Drive returned an empty response.");
        }

        const { Readable } = await import("node:stream");
        Readable.fromWeb(upstream.body).pipe(res);
    } catch (error) {
        next(error);
    }
});

app.use((error, req, res, next) => {
    console.error(error);
    if (res.headersSent) return next(error);
    res.status(500).send("Game server error.");
});

app.listen(port, "0.0.0.0", () => {
    console.log(`HUDGAMES game server running on port ${port}`);
});
'''

SW = r'''const VERSION = "hudgames-v2";

self.addEventListener("install", event => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(
            keys.filter(key => key !== VERSION).map(key => caches.delete(key))
        );
        await self.clients.claim();
    })());
});
'''

def backup(file):
    if file.exists():
        destination = file.with_name(file.name + ".backup")
        shutil.copy2(file, destination)
        print("Backup:", destination.name)

def replace_once(source, old, new, label):
    count = source.count(old)
    if count != 1:
        raise RuntimeError(
            f"Could not safely patch {label}: expected one match, found {count}."
        )
    return source.replace(old, new, 1)

def patch_app():
    if not APP.exists():
        raise FileNotFoundError("public/app.js is missing.")

    source = APP.read_text(encoding="utf-8")

    marker = "// HUDGAMES_SEPARATE_GAME_ORIGIN"
    start = source.find(marker)
    end = source.find("const dbOpen=", start)

    if start < 0 or end < 0:
        raise RuntimeError("Could not find the game-launching section in app.js.")

    replacement = f'''// HUDGAMES_SEPARATE_GAME_ORIGIN

const GAME_ORIGIN = "{GAME_ORIGIN}";

async function play(g) {{
    if (S.user) {{
        api("/api/activity", {{
            method: "POST",
            body: JSON.stringify({{ gameId: g.id }})
        }}).catch(() => {{}});
    }}

    const tab = window.open("about:blank", "_blank");

    if (!tab) {{
        alert("Allow pop-ups for HUDGAMES to launch games.");
        return;
    }}

    tab.opener = null;

    try {{
        const blob = await offlineGet(String(g.id));

        if (blob) {{
            tab.location.href = URL.createObjectURL(blob);
            return;
        }}

        const url = new URL(
            "/play/" + encodeURIComponent(g.id),
            GAME_ORIGIN
        );

        tab.location.href = url.href;
    }} catch (error) {{
        tab.close();
        alert("Could not launch game: " + error.message);
    }}
}}

'''

    source = source[:start] + replacement + source[end:]

    old_request = '''async function requestAction(id,a){await api(`/api/requests/${id}/${a}`,{method:"POST",body:"{}"});loadFriends()}'''

    new_request = '''async function requestAction(id,a){
    const action = a === "decline" ? "reject" : a;
    await api(`/api/requests/${encodeURIComponent(id)}/${action}`, {
        method: "POST",
        body: "{}"
    });
    await loadFriends();
}'''

    source = replace_once(
        source,
        old_request,
        new_request,
        "friend request actions"
    )

    backup(APP)
    APP.write_text(source, encoding="utf-8")
    print("Updated public/app.js")

def update_package():
    if not PACKAGE.exists():
        raise FileNotFoundError("package.json is missing.")

    data = json.loads(PACKAGE.read_text(encoding="utf-8"))

    scripts = data.setdefault("scripts", {})
    scripts["start"] = scripts.get("start", "node server.js")
    scripts["start:games"] = "node game-server.js"

    dependencies = data.setdefault("dependencies", {})
    dependencies.setdefault("@libsql/client", "^0.15.15")

    backup(PACKAGE)
    PACKAGE.write_text(
        json.dumps(data, indent=2) + "\n",
        encoding="utf-8"
    )

    print("Updated package.json")

def write_game_server():
    target = ROOT / "game-server.js"
    backup(target)
    target.write_text(GAME_SERVER, encoding="utf-8")
    print("Created game-server.js")

def write_service_worker():
    target = PUBLIC / "sw.js"
    backup(target)
    target.write_text(SW, encoding="utf-8")
    print("Updated public/sw.js")

def main():
    if not SERVER.exists():
        raise FileNotFoundError("server.js is missing.")

    if not GAMES.exists():
        raise FileNotFoundError("data/games.json is missing.")

    print("Checking game catalogue...")

    catalogue = json.loads(GAMES.read_text(encoding="utf-8"))

    if not isinstance(catalogue, list):
        raise RuntimeError("data/games.json must contain a JSON array.")

    print(f"Found {len(catalogue)} games.")

    print("\nUpdating HUDGAMES...")

    patch_app()
    update_package()
    write_game_server()
    write_service_worker()

    print("\nFix completed.")
    print("\nNext steps:")
    print("1. Run: npm install")
    print("2. Test the main server locally.")
    print("3. Deploy the main service on Render.")
    print("4. Create a SECOND Render Web Service using this repository.")
    print("5. Set its start command to: npm run start:games")
    print("6. Set GOOGLE_API_KEY on the game service.")
    print("7. Change GAME_ORIGIN in public/app.js if the game service URL differs.")
    print("8. Commit and push the changes.")

if __name__ == "__main__":
    main()
