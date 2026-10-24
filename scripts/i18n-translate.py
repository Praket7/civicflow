#!/usr/bin/env python3
"""Generate the 60-locale interface catalogs.

This is a build-time tool, not a runtime dependency: the committed JSON files
in src/lib/i18n/catalogs are what the app ships. Google's public endpoint is
used through the `translators` package, with Yandex as a fallback. Runs are
resumable; existing keys are never translated again unless --force is passed.
"""

import argparse
import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import translators as ts

ROOT = Path("src/lib/i18n")
CATALOGS = ROOT / "catalogs"
LOCALES = json.loads((ROOT / "locales.json").read_text())
STRINGS = json.loads((ROOT / "strings.json").read_text())

TOKENS = [
    ("CivicFlow", "__CF0__"),
    ("AutoRoster", "__CF1__"),
    ("FeedMore WNY", "__CF2__"),
    ("Praket", "__CF3__"),
    ("Maya Chen", "__CF4__"),
    ("Buffalo", "__CF5__"),
    ("NYS", "__CF6__"),
    ("FBLA", "__CF7__"),
    ("Pexels", "__CF8__"),
    ("Geist Mono", "__CF9__"),
    ("Geist", "__CF10__"),
    ("Source Serif 4", "__CF11__"),
    ("Source Serif", "__CF12__"),
    ("SQLite", "__CF13__"),
    ("Tauri", "__CF14__"),
    ("Lucide", "__CF15__"),
    ("GitHub", "__CF16__"),
]

# A bare navigation label is ambiguous to a translator ("Home" becomes "house").
# These fuller source phrases only affect generation; the UI still uses the key.
CONTEXT = {
    "Home": "Home page",
    "Impact": "Community impact",
    "Coverage": "Shift coverage",
    "Coverage center": "Shift coverage center",
    "Schedule": "Work schedule",
    "Records": "Service records",
    "Applications": "Volunteer applications",
    "Insights": "Retention insights",
    "Saved": "Saved opportunities",
    "Profile": "Volunteer profile",
    "Verification": "Service verification",
    "Discover": "Discover opportunities",
    "Credentials": "Credentials and skills",
    "Roster": "Volunteer roster",
    "Check-in": "Volunteer check-in",
    "Onboarding": "Volunteer onboarding",
    "Recruitment": "Volunteer recruitment",
    "Retention": "Volunteer retention",
    "Audit": "Audit log",
    "Backups": "Data backups",
    "Hours": "Volunteer hours",
    "Notifications": "Notifications inbox",
}

LANGUAGE_ALIASES = {"he": "iw"}
SLEEP = 0.35


def protect(text: str):
    placeholders = re.findall(r"\{\w+\}", text)
    for index, placeholder in enumerate(placeholders):
        text = text.replace(placeholder, f"__PH{index}__")
    for term, token in TOKENS:
        text = text.replace(term, token)
    return text, placeholders


def restore(text: str, placeholders) -> str:
    for index, placeholder in enumerate(placeholders):
        text = text.replace(f"__PH{index}__", placeholder)
    for term, token in TOKENS:
        text = text.replace(token, term)
    return text


def chunks(values):
    current, size = [], 0
    for value in values:
        addition = len(value) + 7
        if current and (size + addition > 3200 or len(current) >= 65):
            yield current
            current, size = [], 0
        current.append(value)
        size += addition
    if current:
        yield current


def request(texts, target):
    code = LANGUAGE_ALIASES.get(target, target)
    protected = [protect(text) for text in texts]
    query = "\n@@@\n".join(item[0] for item in protected)
    last_error = None
    for translator in ("google", "yandex", "alibaba"):
        for attempt in range(4):
            try:
                result = ts.translate_text(
                    query,
                    translator=translator,
                    from_language="en",
                    to_language=code,
                )
                parts = [part.strip() for part in re.split(r"\s*@@@\s*", result)]
                if len(parts) == len(texts):
                    return [
                        restore(part, protected[index][1]) for index, part in enumerate(parts)
                    ], translator
                raise ValueError(f"{len(parts)} parts for {len(texts)} strings")
            except Exception as error:  # noqa: BLE001 - third-party error types vary
                last_error = error
                if "Unsupported" in str(error):
                    break
                time.sleep(min(20, 2 * (attempt + 1)))
    raise RuntimeError(f"translation failed: {last_error}")


def translate_locale(meta, force: bool, only_placeholders: bool = False):
    code = meta["code"]
    if code == "en":
        return
    path = CATALOGS / f"{code}.json"
    existing = json.loads(path.read_text()) if path.exists() else {}
    if only_placeholders:
        missing = [text for text in STRINGS if "{" in text]
    else:
        missing = [text for text in STRINGS if force or text not in existing]
    if not missing:
        print(f"{code}: complete ({len(existing)})", flush=True)
        return
    print(f"{code}: {len(missing)} strings", flush=True)
    completed = 0
    for batch in chunks(missing):
        # Translate the context-enriched source, then store under the real key.
        sources = [CONTEXT.get(text, text) for text in batch]
        try:
            translated, service = request(sources, code)
            for key, value in zip(batch, translated):
                existing[key] = value or key
            completed += len(batch)
            path.write_text(json.dumps(existing, ensure_ascii=False))
            print(f"{code}: {completed}/{len(missing)} via {service}", flush=True)
        except Exception as error:  # noqa: BLE001 - keep partial progress
            print(f"{code}: batch failed — {error}", file=sys.stderr, flush=True)
        time.sleep(SLEEP)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--locale", help="comma-separated locale codes")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--only-placeholders", action="store_true")
    parser.add_argument("--workers", type=int, default=1)
    parser.add_argument("--sleep", type=float, default=0.35)
    args = parser.parse_args()

    global SLEEP
    SLEEP = args.sleep
    CATALOGS.mkdir(parents=True, exist_ok=True)
    wanted = args.locale.split(",") if args.locale else [meta["code"] for meta in LOCALES]
    queue = [meta for meta in LOCALES if meta["code"] in wanted]
    lock = __import__("threading").Lock()

    def worker():
        while True:
            with lock:
                if not queue:
                    return
                meta = queue.pop(0)
            try:
                translate_locale(meta, args.force, args.only_placeholders)
            except Exception as error:  # noqa: BLE001 - report and continue
                print(f"{meta['code']}: failed — {error}", file=sys.stderr, flush=True)

    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        list(pool.map(lambda _: worker(), range(max(1, args.workers))))


if __name__ == "__main__":
    main()
