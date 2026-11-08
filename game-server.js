
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
        // Remove malformed comment lines.
        .split(/\r?\n/)
        .filter(line => !line.trimEnd().endsWith("--!>"))
        .join("\n")

        // Upgrade insecure resource URLs.
        .replace(/\bhttp:\/\/(?=[^"'`\s<>]*\.(?:css|js|ico|png|jpe?g|gif|svg|woff2?|ttf|webp)(?:[?#"'`\s<>]|$))/gi, "https://")

        // Upgrade HTTP URLs in HTML attributes.
        .replace(
            /(\b(?:href|src|poster|action)\s*=\s*)(["'])http:\/\//gi,
            "$1$2https://"
        )

        // Upgrade HTTP URLs in CSS url().
        .replace(
            /(url\(\s*["']?)http:\/\//gi,
            "$1https://"
        )

        // Upgrade HTTP CSS imports.
        .replace(
            /(@import\s+["'])http:\/\//gi,
            "$1https://"
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

        if (!upstream.body) {
            return res.status(502).send(
                "Google Drive returned an empty response."
            );
        }

        if (
            contentType.includes("text/html") ||
            contentType.includes("text/css")
        ) {
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