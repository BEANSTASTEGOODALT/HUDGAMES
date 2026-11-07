# HUDGAMES

Steam-inspired web game launcher using vanilla HTML/CSS/JS, Node.js and SQLite.

## Run on Windows

1. Extract this folder.
2. Copy `.env.example` to `.env`.
3. Put your Google Drive API key in `GOOGLE_API_KEY`. Set long random values for `SESSION_SECRET` and `ADMIN_TOKEN`. Never publish `.env`.
4. Open CMD in this folder and run:
   ```cmd
   npm install
   npm start
   ```
5. Visit http://localhost:3000

Your Node.js 26.12.1 is suitable. The SQLite database is created automatically at `data/hudgames.sqlite`.

## Online hosting

Use a Node.js host with persistent storage (not static-only hosting). Push this folder to a private GitHub repository, excluding `.env`, the SQLite database and package uploads. Create a Node web service with build command `npm install` and start command `npm start`. Add `GOOGLE_API_KEY`, `SESSION_SECRET`, `ADMIN_TOKEN`, `NODE_ENV=production`, and `TRUST_PROXY=true` as host environment variables. Attach persistent storage for both `data/` and `storage/`, enable HTTPS, then connect your domain using the host's DNS instructions.

Before public launch, add rate limiting, CSRF protection, password recovery, moderation/reporting, backups and a production database plan.

## Catalogue and Drive

`data/games.json` stores the catalogue. Each game's `id` is treated as its Google Drive file ID. The server fetches Drive content, so the API key is not exposed in browser JavaScript. Drive permissions and quotas still apply.

## Offline packages

The app shell is cached by a service worker. Games marked offline are downloaded into IndexedDB on the user's device. An administrator can upload a self-contained game file using `POST /api/admin/games/:id/package` with multipart field `package` and header `x-admin-token`. The current version is designed for self-contained HTML files; games with external dependencies need those dependencies bundled. Multi-file ZIP extraction and manifest support are not included yet.

## Notes

The app includes accounts, friend codes, requests, friend list, private chat, favourites and polling-based presence. It is an early working starter, not yet hardened for public production. The game player is sandboxed; some ports may need additional browser permissions or external assets and may not work as embedded pages.
