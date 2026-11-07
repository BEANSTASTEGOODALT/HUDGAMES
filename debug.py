
import os
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent

EXCLUDED_DIRS = {
    "node_modules", ".git", ".venv", "venv",
    "__pycache__", "storage", "uploads",
    "dist", "build", "coverage", "data"
}

ALLOWED_EXTENSIONS = {
    ".js", ".mjs", ".cjs", ".html", ".css",
    ".py", ".sql", ".md", ".yaml", ".yml", ".toml"
}

ALLOWED_NAMES = {
    "package.json", "render.yaml", "procfile"
}

MAX_FILE_SIZE = 350_000
MAX_TOTAL_SIZE = 1_500_000


def command_output(command):
    try:
        result = subprocess.run(
            command,
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=10,
            shell=True
        )
        return (result.stdout or result.stderr).strip() or "No output"
    except Exception as error:
        return str(error)


def get_env_names():
    env_file = ROOT / ".env"
    if not env_file.exists():
        return "No .env file found"

    names = []
    for line in env_file.read_text(
        encoding="utf-8", errors="replace"
    ).splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            names.append(line.split("=", 1)[0].strip())

    return "\n".join(names) or "No variables found"


def should_include(path):
    relative = path.relative_to(ROOT)

    if any(part.lower() in EXCLUDED_DIRS for part in relative.parts):
        return False

    if path.name.lower() in {
        ".env", ".env.local", ".env.production",
        "package-lock.json", "npm-shrinkwrap.json"
    }:
        return False

    if path.name.lower() in ALLOWED_NAMES:
        return True

    return path.suffix.lower() in ALLOWED_EXTENSIONS


def collect_files():
    files = []

    for directory, dirs, filenames in os.walk(ROOT):
        dirs[:] = [
            d for d in dirs
            if d.lower() not in EXCLUDED_DIRS
        ]

        for filename in filenames:
            path = Path(directory) / filename

            if path.name == "debug_auth.py":
                continue

            if should_include(path):
                files.append(path)

    return sorted(files)


def main():
    output = []
    total_size = 0

    output.append("HUDGAMES AUTHENTICATION DEBUG REPORT")
    output.append("=" * 60)
    output.append(f"Project: {ROOT}")
    output.append(f"Node: {command_output('node --version')}")
    output.append(f"npm: {command_output('npm --version')}")
    output.append("")
    output.append("GIT STATUS")
    output.append(command_output("git status --short"))
    output.append("")
    output.append("ENVIRONMENT VARIABLE NAMES ONLY")
    output.append(get_env_names())
    output.append("")
    output.append("PROJECT FILES")
    output.append("-" * 60)

    files = collect_files()

    for path in files:
        try:
            size = path.stat().st_size

            if size > MAX_FILE_SIZE:
                output.append(
                    f"\n[SKIPPED LARGE FILE: {path.relative_to(ROOT)} "
                    f"({size:,} bytes)]"
                )
                continue

            if total_size + size > MAX_TOTAL_SIZE:
                output.append("\n[STOPPED: TOTAL SIZE LIMIT REACHED]")
                break

            content = path.read_text(
                encoding="utf-8",
                errors="replace"
            )

            relative = path.relative_to(ROOT)
            output.append("\n" + "=" * 60)
            output.append(f"FILE: {relative}")
            output.append("=" * 60)
            output.append(content)

            total_size += size

        except Exception as error:
            output.append(f"\n[ERROR READING {path.name}: {error}]")

    report = "\n".join(output)

    try:
        subprocess.run(
            "clip",
            input=report,
            text=True,
            check=True,
            shell=True
        )
        print("SUCCESS! HUDGAMES debug report copied to clipboard.")
        print(f"Files found: {len(files)}")
        print(f"Source size: {total_size:,} bytes")
        print("Paste the clipboard contents into ChatGPT.")
    except Exception as error:
        print("Clipboard error:", error)
        print("You can still find the report in the script output.")


if __name__ == "__main__":
    main()
