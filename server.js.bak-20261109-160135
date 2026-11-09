import express from "express";
import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";

const root = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const dataDir = path.join(root, "data");
const packageDir = path.join(root, "storage", "packages");

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(packageDir, { recursive: true });

function loadEnv() {
    const file = path.join(root, ".env");
    if (!fs.existsSync(file)) return;

    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) {
            process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
        }
    }
}

loadEnv();

if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required.");
}

const db = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
});

async function execute(sql, args = []) {
    return db.execute({ sql, args });
}

async function one(sql, args = []) {
    const result = await execute(sql, args);
    return result.rows[0] || null;
}

async function all(sql, args = []) {
    const result = await execute(sql, args);
    return result.rows;
}

async function run(sql, args = []) {
    return execute(sql, args);
}

async function initialize() {
    const statements = [
        `CREATE TABLE IF NOT EXISTS users(
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE COLLATE NOCASE,
            display_name TEXT,
            friend_code TEXT UNIQUE,
            salt TEXT,
            pass_hash TEXT,
            created INTEGER,
            last_seen INTEGER,
            playing_id TEXT,
            playing_name TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS sessions(
            token_hash TEXT PRIMARY KEY,
            user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
            expires INTEGER
        )`,
        `CREATE TABLE IF NOT EXISTS friends(
            user_id TEXT,
            friend_id TEXT,
            created INTEGER,
            PRIMARY KEY(user_id,friend_id)
        )`,
        `CREATE TABLE IF NOT EXISTS requests(
            id TEXT PRIMARY KEY,
            from_id TEXT,
            to_id TEXT,
            created INTEGER,
            UNIQUE(from_id,to_id)
        )`,
        `CREATE TABLE IF NOT EXISTS messages(
            id TEXT PRIMARY KEY,
            from_id TEXT,
            to_id TEXT,
            body TEXT,
            created INTEGER
        )`,
        `CREATE TABLE IF NOT EXISTS favorites(
            user_id TEXT,
            game_id TEXT,
            created INTEGER,
            PRIMARY KEY(user_id,game_id)
        )`,
        `CREATE TABLE IF NOT EXISTS blocks(
            user_id TEXT,
            blocked_id TEXT,
            created INTEGER,
            PRIMARY KEY(user_id,blocked_id)
        )`,
        `CREATE TABLE IF NOT EXISTS game_meta(
            game_id TEXT PRIMARY KEY,
            description TEXT DEFAULT '',
            cover TEXT DEFAULT '',
            offline INTEGER DEFAULT 0,
            package TEXT DEFAULT ''
        )`
    ];

    for (const sql of statements) await execute(sql);
}

const games = JSON.parse(
    fs.readFileSync(path.join(dataDir, "games.json"), "utf8")
);
const byId = new Map(games.map(g => [String(g.id), g]));

const now = () => Date.now();
const rand = (n = 24) => crypto.randomBytes(n).toString("hex");
const sha = s => crypto.createHash("sha256").update(s).digest("hex");
const passwordHash = (p, s) =>
    crypto.scryptSync(p, s, 64).toString("hex");

const cookie = "hudgames_session";

app.set("trust proxy", true);
app.use(express.json({ limit: "1mb" }));

app.use(async (req, res, next) => {
    try {
        const m = (req.headers.cookie || "").match(
            new RegExp("(?:^|;\\s*)" + cookie + "=([^;]+)")
        );

        req.token = m ? decodeURIComponent(m[1]) : null;

        const row = req.token
            ? await one(
                `SELECT u.* FROM sessions s
                 JOIN users u ON u.id=s.user_id
                 WHERE s.token_hash=? AND s.expires>?`,
                [sha(req.token), now()]
            )
            : null;

        req.user = row || null;

        if (row && now() - Number(row.last_seen) > 25000) {
            await run(
                "UPDATE users SET last_seen=? WHERE id=?",
                [now(), row.id]
            );
        }

        next();
    } catch (error) {
        next(error);
    }
});

const auth = (req, res, next) =>
    req.user ? next() : res.status(401).json({ error: "Sign in first." });

async function friend(a, b) {
    return !!await one(
        "SELECT 1 FROM friends WHERE user_id=? AND friend_id=?",
        [a, b]
    );
}

async function session(id, res) {
    const token = rand(32);

    await run(
        "INSERT INTO sessions VALUES(?,?,?)",
        [sha(token), id, now() + 30 * 86400000]
    );

    res.setHeader(
        "Set-Cookie",
        `${cookie}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000; Secure`
    );
}

function safeUser(u) {
    return {
        id: u.id,
        username: u.username,
        displayName: u.display_name,
        friendCode: u.friend_code,
        online: now() - Number(u.last_seen) < 90000,
        lastSeen: u.last_seen,
        playingName: u.playing_name
    };
}

async function gameView(g, uid) {
    const m = await one(
        "SELECT * FROM game_meta WHERE game_id=?",
        [String(g.id)]
    );

    const fav = uid
        ? !!await one(
            "SELECT 1 FROM favorites WHERE user_id=? AND game_id=?",
            [uid, String(g.id)]
        )
        : false;

    return {
        id: String(g.id),
        name: g.name || g.title || "Untitled",
        title: g.title || g.name || "Untitled",
        description: m?.description || "",
        cover: m?.cover || "",
        offline: !!m?.offline,
        favorite: fav
    };
}

app.post("/api/register", async (req, res, next) => {
    try {
        const username = String(req.body.username || "").trim();
        const password = String(req.body.password || "");

        if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
            return res.status(400).json({
                error: "Username must be 3–20 letters, numbers or underscores."
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                error: "Password must be at least 8 characters."
            });
        }

        const id = rand(16);
        const salt = rand(16);
        const code = rand(4).toUpperCase();

        try {
            await run(
                "INSERT INTO users VALUES(?,?,?,?,?,?,?,?,?,?)",
                [
                    id,
                    username,
                    String(req.body.displayName || username).slice(0, 32),
                    code,
                    salt,
                    passwordHash(password, salt),
                    now(),
                    now(),
                    null,
                    null
                ]
            );

            await session(id, res);
            const user = await one("SELECT * FROM users WHERE id=?", [id]);

            res.json({ user: safeUser(user) });
        } catch {
            res.status(409).json({ error: "Username already exists." });
        }
    } catch (error) {
        next(error);
    }
});

app.post("/api/login", async (req, res, next) => {
    try {
        const u = await one(
            "SELECT * FROM users WHERE username=? COLLATE NOCASE",
            [String(req.body.username || "")]
        );

        if (!u || passwordHash(String(req.body.password || ""), u.salt) !== u.pass_hash) {
            return res.status(401).json({ error: "Incorrect username or password." });
        }

        await session(u.id, res);
        res.json({ user: safeUser(u) });
    } catch (error) {
        next(error);
    }
});

app.post("/api/logout", async (req, res, next) => {
    try {
        if (req.token) {
            await run("DELETE FROM sessions WHERE token_hash=?", [sha(req.token)]);
        }

        res.setHeader(
            "Set-Cookie",
            `${cookie}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Secure`
        );

        res.json({ ok: true });
    } catch (error) {
        next(error);
    }
});

app.get("/api/me", (req, res) => {
    res.json({ user: req.user ? safeUser(req.user) : null });
});

app.get("/api/games", async (req, res, next) => {
    try {
        const q = String(req.query.q || "").toLowerCase();

        const found = games.filter(g =>
            String(g.name || g.title || "").toLowerCase().includes(q)
        );

        res.json({
            games: await Promise.all(
                found.map(g => gameView(g, req.user?.id))
            )
        });
    } catch (error) {
        next(error);
    }
});

app.get("/api/games/:id", async (req, res, next) => {
    try {
        const g = byId.get(String(req.params.id));

        if (!g) return res.status(404).json({ error: "Game not found." });

        res.json({ game: await gameView(g, req.user?.id) });
    } catch (error) {
        next(error);
    }
});

app.get("/api/games/:id/play", async (req, res, next) => {
    try {
        const id = String(req.params.id);
        const g = byId.get(id);

        if (!g) return res.status(404).send("Game not found.");

        if (req.user) {
            await run(
                "UPDATE users SET playing_id=?,playing_name=?,last_seen=? WHERE id=?",
                [id, g.name || g.title, now(), req.user.id]
            );
        }

        const meta = await one(
            "SELECT * FROM game_meta WHERE game_id=?",
            [id]
        );

        if (meta?.package) {
            const file = path.join(packageDir, path.basename(meta.package));

            if (fs.existsSync(file)) return res.sendFile(file);
        }

        if (!process.env.GOOGLE_API_KEY) {
            return res.status(503).send("Drive API is not configured.");
        }

        const url =
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}` +
            `?alt=media&key=${encodeURIComponent(process.env.GOOGLE_API_KEY)}`;

        const upstream = await fetch(url);

        if (!upstream.ok) {
            return res.status(upstream.status).send("Could not load game from Drive.");
        }

        res.setHeader(
            "Content-Type",
            upstream.headers.get("content-type") || "text/html; charset=utf-8"
        );

        res.setHeader("Cache-Control", "no-store");
        res.send(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
        next(error);
    }
});

app.post("/api/favorites/:id", auth, async (req, res, next) => {
    try {
        const id = String(req.params.id);

        if (!byId.has(id)) {
            return res.status(404).json({ error: "Game not found." });
        }

        const exists = await one(
            "SELECT 1 FROM favorites WHERE user_id=? AND game_id=?",
            [req.user.id, id]
        );

        if (exists) {
            await run(
                "DELETE FROM favorites WHERE user_id=? AND game_id=?",
                [req.user.id, id]
            );
        } else {
            await run(
                "INSERT INTO favorites VALUES(?,?,?)",
                [req.user.id, id, now()]
            );
        }

        res.json({ favorite: !exists });
    } catch (error) {
        next(error);
    }
});

app.get("/api/favorites", auth, async (req, res, next) => {
    try {
        const ids = (await all(
            "SELECT game_id FROM favorites WHERE user_id=? ORDER BY created DESC",
            [req.user.id]
        )).map(x => x.game_id);

        const selected = ids.map(id => byId.get(id)).filter(Boolean);

        res.json({
            games: await Promise.all(
                selected.map(g => gameView(g, req.user.id))
            )
        });
    } catch (error) {
        next(error);
    }
});

app.post("/api/friends/request", auth, async (req, res, next) => {
    try {
        const target = await one(
            "SELECT * FROM users WHERE friend_code=?",
            [String(req.body.friendCode || "").toUpperCase().trim()]
        );

        if (!target) {
            return res.status(404).json({ error: "Friend code not found." });
        }

        if (target.id === req.user.id || await friend(req.user.id, target.id)) {
            return res.status(409).json({
                error: "That friend request cannot be sent."
            });
        }

        try {
            await run(
                "INSERT INTO requests VALUES(?,?,?,?)",
                [rand(12), req.user.id, target.id, now()]
            );

            res.json({ ok: true });
        } catch {
            res.status(409).json({ error: "Request already exists." });
        }
    } catch (error) {
        next(error);
    }
});

app.get("/api/friends", auth, async (req, res, next) => {
    try {
        const rows = await all(
            `SELECT u.* FROM friends f
             JOIN users u ON u.id=f.friend_id
             WHERE f.user_id=?`,
            [req.user.id]
        );

        res.json({ friends: rows.map(safeUser) });
    } catch (error) {
        next(error);
    }
});

app.get("/api/requests", auth, async (req, res, next) => {
    try {
        const rows = await all(
            `SELECT r.id,u.username,u.display_name,u.friend_code
             FROM requests r
             JOIN users u ON u.id=r.from_id
             WHERE r.to_id=?`,
            [req.user.id]
        );

        res.json({ requests: rows });
    } catch (error) {
        next(error);
    }
});

app.post("/api/requests/:id/:action", auth, async (req, res, next) => {
    try {
        const r = await one(
            "SELECT * FROM requests WHERE id=? AND to_id=?",
            [req.params.id, req.user.id]
        );

        if (!r) return res.status(404).json({ error: "Request not found." });

        if (req.params.action === "accept") {
            await execute(
                `INSERT OR IGNORE INTO friends VALUES(?,?,?),
                 (?,?,?)`,
                [
                    r.from_id, r.to_id, now(),
                    r.to_id, r.from_id, now()
                ]
            );

            await run("DELETE FROM requests WHERE id=?", [r.id]);
        } else if (req.params.action === "reject") {
            await run("DELETE FROM requests WHERE id=?", [r.id]);
        } else {
            return res.status(400).json({ error: "Invalid action." });
        }

        res.json({ ok: true });
    } catch (error) {
        next(error);
    }
});

app.get("/api/messages/:id", auth, async (req, res, next) => {
    try {
        if (!await friend(req.user.id, req.params.id)) {
            return res.status(403).json({
                error: "You must be friends to chat."
            });
        }

        const rows = await all(
            `SELECT * FROM messages
             WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?)
             ORDER BY created DESC LIMIT 100`,
            [req.user.id, req.params.id, req.params.id, req.user.id]
        );

        res.json({ messages: rows.reverse() });
    } catch (error) {
        next(error);
    }
});

app.post("/api/messages/:id", auth, async (req, res, next) => {
    try {
        if (!await friend(req.user.id, req.params.id)) {
            return res.status(403).json({
                error: "You must be friends to chat."
            });
        }

        const body = String(req.body.body || "").trim().slice(0, 2000);

        if (!body) {
            return res.status(400).json({ error: "Message is empty." });
        }

        await run(
            "INSERT INTO messages VALUES(?,?,?,?,?)",
            [rand(12), req.user.id, req.params.id, body, now()]
        );

        res.json({ ok: true });
    } catch (error) {
        next(error);
    }
});

app.post("/api/activity", auth, async (req, res, next) => {
    try {
        if (!Object.prototype.hasOwnProperty.call(req.body || {}, "gameId")) {
            await run(
                "UPDATE users SET last_seen=? WHERE id=?",
                [now(), req.user.id]
            );

            return res.json({ ok: true });
        }

        const id = req.body.gameId ? String(req.body.gameId) : null;
        const g = id ? byId.get(id) : null;

        await run(
            "UPDATE users SET playing_id=?,playing_name=?,last_seen=? WHERE id=?",
            [g ? id : null, g ? (g.name || g.title) : null, now(), req.user.id]
        );

        res.json({ ok: true });
    } catch (error) {
        next(error);
    }
});

const upload = multer({
    dest: packageDir,
    limits: { fileSize: 250 * 1024 * 1024 }
});

function admin(req, res, next) {
    if (!process.env.ADMIN_TOKEN ||
        req.headers["x-admin-token"] !== process.env.ADMIN_TOKEN) {
        return res.status(403).json({ error: "Admin access denied." });
    }

    next();
}

app.post(
    "/api/admin/games/:id/package",
    admin,
    upload.single("package"),
    async (req, res, next) => {
        try {
            const id = String(req.params.id);

            if (!byId.has(id)) {
                return res.status(404).json({ error: "Game not found." });
            }

            if (!req.file) {
                return res.status(400).json({ error: "Package file required." });
            }

            const ext = path.extname(req.file.originalname).slice(0, 10) || ".html";
            const name = sha(id).slice(0, 20) + ext;

            fs.renameSync(req.file.path, path.join(packageDir, name));

            await run(
                `INSERT INTO game_meta
                 (game_id,description,cover,offline,package)
                 VALUES(?,?,?,?,?)
                 ON CONFLICT(game_id) DO UPDATE SET
                 description=excluded.description,
                 cover=excluded.cover,
                 offline=1,
                 package=excluded.package`,
                [
                    id,
                    String(req.body.description || "").slice(0, 2000),
                    String(req.body.cover || ""),
                    1,
                    name
                ]
            );

            res.json({ ok: true });
        } catch (error) {
            next(error);
        }
    }
);

app.use(express.static(path.join(root, "public")));

app.use((req, res) => {
    res.sendFile(path.join(root, "public", "index.html"));
});

app.use((error, req, res, next) => {
    console.error(error);
    if (res.headersSent) return next(error);
    res.status(500).json({ error: "Server error." });
});

await initialize();

app.listen(port, "0.0.0.0", () => {
    console.log(`HUDGAMES running on port ${port}`);
});
