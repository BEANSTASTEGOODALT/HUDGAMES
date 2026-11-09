from pathlib import Path
from datetime import datetime
import sys

ROOT = Path(__file__).resolve().parent
APP_FILE = ROOT / "public" / "app.js"
SERVER_FILE = ROOT / "server.js"

APP_MARKER = "HUDGAMES_INSTANT_CATALOG_CACHE_V1"
SERVER_MARKER = "HUDGAMES_FAST_GAMES_API_V1"

def read_file(path):
    if not path.is_file():
        raise FileNotFoundError(f"Missing file: {path}")
    return path.read_text(encoding="utf-8")

def backup(path, content):
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    target = path.with_name(path.name + ".bak-" + stamp)
    target.write_text(content, encoding="utf-8", newline="")
    print(f"Backup: {target.name}")

def patch_app(source):
    if APP_MARKER in source:
        print("app.js already has the instant catalogue cache.")
        return source, False

    old_init_load = 'S.games=(await api("/api/games")).games;render();'
    if source.count(old_init_load) != 1:
        raise RuntimeError(
            "Could not find the exact games-loading line in public/app.js. "
            "Nothing was changed. Check that this is the app.js you supplied."
        )

    helper = r'''
// HUDGAMES_INSTANT_CATALOG_CACHE_V1
// Show the last catalogue immediately, then refresh it from the server.
async function loadGamesCached() {
    const cacheName = "hudgames-catalog-v1";
    const cacheKey = new URL(
        "/__hudgames_cache/catalog/" +
        encodeURIComponent(S.user?.id || "guest"),
        location.origin
    ).href;

    let cache = null;
    let showedCachedGames = false;

    if ("caches" in window) {
        try {
            cache = await caches.open(cacheName);
            const saved = await cache.match(cacheKey);

            if (saved) {
                const cachedData = await saved.json();

                if (Array.isArray(cachedData.games)) {
                    S.games = cachedData.games;
                    render();
                    showedCachedGames = true;
                    console.log(
                        "HUDGAMES: displayed cached catalogue (" +
                        S.games.length + " games)"
                    );
                }
            }
        } catch (error) {
            console.warn("HUDGAMES: catalogue cache unavailable:", error);
        }
    }

    try {
        const response = await fetch("/api/games", {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store",
            headers: { "Accept": "application/json" }
        });

        if (!response.ok) {
            throw new Error("Games request failed (" + response.status + ")");
        }

        const data = await response.json();

        if (!data || !Array.isArray(data.games)) {
            throw new Error("The games API returned an invalid catalogue.");
        }

        S.games = data.games;
        render();

        if (cache) {
            try {
                await cache.put(
                    cacheKey,
                    new Response(JSON.stringify(data), {
                        headers: { "Content-Type": "application/json" }
                    })
                );
            } catch (error) {
                console.warn("HUDGAMES: could not save catalogue cache:", error);
            }
        }

        console.log(
            "HUDGAMES: refreshed catalogue (" + S.games.length + " games)"
        );
    } catch (error) {
        if (!showedCachedGames) throw error;

        console.warn(
            "HUDGAMES: server refresh failed; keeping saved catalogue:",
            error
        );
    }
}

'''
    source = source.replace(
        "async function init(){",
        helper + "async function init(){",
        1
    )
    source = source.replace(
        old_init_load,
        "await loadGamesCached();",
        1
    )
    return source, True

def patch_server(source):
    if SERVER_MARKER in source:
        print("server.js already has the fast games API.")
        return source, False

    start_marker = 'app.get("/api/games", async (req, res, next) => {'
    end_marker = 'app.get("/api/games/:id", async (req, res, next) => {'

    start = source.find(start_marker)
    end = source.find(end_marker, start + len(start_marker)) if start >= 0 else -1

    if start < 0 or end < 0:
        raise RuntimeError(
            'Could not locate the /api/games route in server.js. '
            'Nothing was changed. Check that this is the server.js you supplied.'
        )

    replacement = r'''
// HUDGAMES_FAST_GAMES_API_V1
app.get("/api/games", async (req, res, next) => {
    try {
        const q = String(req.query.q || "").toLowerCase();

        const found = games.filter(g =>
            String(g.name || g.title || "").toLowerCase().includes(q)
        );

        // Fetch metadata and this user's favourites in two queries total.
        // The old implementation made up to two database queries per game.
        const metadataRows = await all("SELECT * FROM game_meta");
        const metadata = new Map(
            metadataRows.map(row => [String(row.game_id), row])
        );

        const favouriteIds = req.user
            ? new Set(
                (await all(
                    "SELECT game_id FROM favorites WHERE user_id=?",
                    [req.user.id]
                )).map(row => String(row.game_id))
            )
            : new Set();

        const result = found.map(g => {
            const id = String(g.id);
            const meta = metadata.get(id);

            return {
                id,
                name: g.name || g.title || "Untitled",
                title: g.title || g.name || "Untitled",
                description: meta?.description || "",
                cover: meta?.cover || "",
                offline: !!meta?.offline,
                favorite: favouriteIds.has(id)
            };
        });

        res.setHeader("Cache-Control", "private, no-cache");
        res.json({ games: result });
    } catch (error) {
        next(error);
    }
});

'''
    source = source[:start] + replacement + source[end:]
    return source, True

def main():
    app_original = read_file(APP_FILE)
    server_original = read_file(SERVER_FILE)

    # Prepare both edits before writing either file, so a mismatch is safe.
    app_updated, app_changed = patch_app(app_original)
    server_updated, server_changed = patch_server(server_original)

    if not app_changed and not server_changed:
        print("\nNothing to do. Both fixes are already installed.")
        return

    if app_changed:
        backup(APP_FILE, app_original)
    if server_changed:
        backup(SERVER_FILE, server_original)

    APP_FILE.write_text(app_updated, encoding="utf-8", newline="")
    SERVER_FILE.write_text(server_updated, encoding="utf-8", newline="")

    print("\nHUDGAMES fixes installed successfully.")
    print("- Returning visitors display their saved games list immediately.")
    print("- The latest games list refreshes in the background.")
    print("- The games API now uses bulk database queries instead of thousands.")
    print("\nNext: test locally, then commit and push the changed files.")

if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("\nFIX FAILED:", error)
        print("No project files were changed.")
        sys.exit(1)
