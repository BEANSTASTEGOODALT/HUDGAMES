
import { createClient } from "@libsql/client";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
    const file = path.join(root, ".env");
    if (!fs.existsSync(file)) return;

    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (match && !process.env[match[1]]) {
            process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
        }
    }
}

loadEnv();

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
    throw new Error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN in .env");
}

const localPath = path.join(root, "data", "hudgames.sqlite");

if (!fs.existsSync(localPath)) {
    throw new Error("Local SQLite database not found: " + localPath);
}

const local = new DatabaseSync(localPath);
const remote = createClient({ url, authToken });

const quote = value => '"' + value.replace(/"/g, '""') + '"';

async function migrate() {
    const tables = local.prepare(`
        SELECT name, sql
        FROM sqlite_master
        WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
        ORDER BY rowid
    `).all();

    console.log("Creating Turso tables...");

    for (const table of tables) {
        const sql = table.sql.replace(
            /^CREATE TABLE\s+/i,
            "CREATE TABLE IF NOT EXISTS "
        );

        await remote.execute({ sql });
        console.log("Created/verified:", table.name);
    }

    console.log("\nCopying database records...");

    for (const table of tables) {
        const name = table.name;
        const columns = local.prepare(
            `PRAGMA table_info(${quote(name)})`
        ).all();

        const rows = local.prepare(
            `SELECT * FROM ${quote(name)}`
        ).all();

        console.log(`Migrating ${name}: ${rows.length} rows`);

        if (!columns.length || !rows.length) continue;

        const columnNames = columns.map(c => quote(c.name));
        const placeholders = columns.map(() => "?").join(",");

        const sql = `
            INSERT OR REPLACE INTO ${quote(name)}
            (${columnNames.join(",")})
            VALUES (${placeholders})
        `;

        for (const row of rows) {
            await remote.execute({
                sql,
                args: columns.map(c => row[c.name])
            });
        }
    }

    console.log("\nCopying indexes...");

    const indexes = local.prepare(`
        SELECT sql
        FROM sqlite_master
        WHERE type = 'index'
        AND sql IS NOT NULL
    `).all();

    for (const index of indexes) {
        await remote.execute({
            sql: index.sql.replace(
                /^CREATE (UNIQUE )?INDEX\s+/i,
                "CREATE $1INDEX IF NOT EXISTS "
            )
        });
    }

    console.log("\nVerifying migration...");

    for (const table of tables) {
        const result = await remote.execute(
            `SELECT COUNT(*) AS total FROM ${quote(table.name)}`
        );

        console.log(`${table.name}: ${result.rows[0].total} rows`);
    }

    console.log("\nHUDGAMES migration completed!");
}

try {
    await migrate();
} catch (error) {
    console.error("\nMigration failed:", error.message);
    process.exitCode = 1;
} finally {
    local.close();
    await remote.close();
}
