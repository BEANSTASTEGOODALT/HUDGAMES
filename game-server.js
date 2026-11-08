
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";

const root = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);

const gamesFile = path.join(root, "data", "games.json");

if (!fs.existsSync(gamesFile)) {
    throw new Error("data/games.json is missing.");
}

const games = JSON.parse(
    fs.readFileSync(gamesFile, "utf8")
);

if (!Array.isArray(games)) {
    throw new Error("games.json must contain an array.");
}

const byId = new Map(
    games.map(game => [String(game.id), game])
);

function cleanContent(content) {
    return content
        // Remove malformed comment-ending lines.
        .split(/\r?\n/)
        .filter(line => !line.trimEnd().endsWith("--!>"))
        .join("\n")

        // Fix the CDN responsible for the reported mixed-content errors.
        .replace(
            /http:\/\/cdn\.statically\.io\//gi,
            "https://cdn.statically.io/"
        )

        // Fix HTTP URLs in HTML, JS and CSS.
        .replace(
            /http:\/\/([^"'`\s<>]+)/gi,
            (match, url) => {
                // Avoid changing localhost URLs.
                if (/^(localhost|127\.0\.0\.1)(:|\/)/i.test(url)) {
                    return match;
                }

                return "https://" + url;
            }
        );
}

function shouldClean(contentType, url) {
    return (
        contentType.includes("text/html") ||
        contentType.includes("text/css") ||
        contentType.includes("javascript") ||
        contentType.includes("ecmascript") ||
        /\.(?:html?|css|js)(?:[?#]|$)/i.test(url)
    );
}

app.get("/health", (req, res) => {
    res.json({
        ok: true,
        games: games.length
    });
});

app.get("/play/:id", async (req, res, next) => {
    try {
        const id = String(req.params.id);
        const game = byId.get(id);

        if (!game) {
            return res.status(404).send("Game not found.");
        }

        if (!process.env.GOOGLE_API_KEY) {
            return res.status(503).send(
                "Google Drive API key is not configured."
            );
        }

        const url =
            "https://www.googleapis.com/drive/v3/files/" +
            encodeURIComponent(id) +
            "?alt=media&key=" +
            encodeURIComponent(process.env.GOOGLE_API_KEY);

        const upstream = await fetch(url);

        if (!upstream.ok) {
            return res.status(
                upstream.status === 404 ? 404 : 502
            ).send("Could not load game from Google Drive.");
        }

        const contentType =
            upstream.headers.get("content-type") ||
            "application/octet-stream";

        res.setHeader("Content-Type", contentType);
res.setHeader("Cache-Control", "no-store");
res.setHeader("X-Content-Type-Options", "nosniff");
res.setHeader(
    "Content-Security-Policy",
    "upgrade-insecure-requests"
);

        if (!upstream.body) {
            return res.status(502).send(
                "Google Drive returned an empty response."
            );
        }

        if (shouldClean(contentType, url)) {
            console.log("Cleaning game HTML/JS/CSS:", id);

            const content = await upstream.text();
            return res.send(cleanContent(content));
        }

        Readable.fromWeb(upstream.body).pipe(res);

    } catch (error) {
        next(error);
    }
});

app.use((error, req, res, next) => {
    console.error(error);

    if (res.headersSent) {
        return next(error);
    }

    res.status(500).send("Game server error.");
});

app.listen(port, "0.0.0.0", () => {
    console.log(
        `HUDGAMES game server running on port ${port}`
    );
});
