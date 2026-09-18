"""Fail when a file that every backend service carries a copy of drifts.

Each service under api/ is its own Docker build context, so shared code is
copied rather than imported. This keeps the copies identical: edit the
canonical file (api/auth/...), then copy it to every service listed.

    python scripts/check_shared_files.py
"""
import hashlib
import pathlib
import sys

API = pathlib.Path(__file__).resolve().parent.parent / "api"
CANONICAL = "auth"
SHARED = {
    "app/utils/guards.py": [
        "auth", "users", "friends", "comments", "messaging", "ingestor",
        "wallet", "contests", "leagues", "media", "notifications",
    ],
    "app/utils/errors.py": [
        "auth", "users", "friends", "comments", "messaging", "ingestor",
        "wallet", "contests", "leagues", "media", "notifications", "twilio",
    ],
    "wsgi.py": [
        "auth", "users", "friends", "comments", "messaging", "ingestor",
        "wallet", "contests", "leagues", "media", "notifications", "twilio",
    ],
    "migrations/env.py": [
        "auth", "users", "friends", "comments", "messaging", "ingestor",
        "wallet", "contests", "leagues", "media", "notifications",
    ],
    "migrations/script.py.mako": [
        "auth", "users", "friends", "comments", "messaging", "ingestor",
        "wallet", "contests", "leagues", "media", "notifications",
    ],
}


def digest(path):
    # Line endings don't count (Windows checkouts use CRLF).
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def main():
    bad = []
    for rel, services in SHARED.items():
        want = digest(API / CANONICAL / rel)
        for svc in services:
            path = API / svc / rel
            if not path.exists():
                bad.append(f"missing  api/{svc}/{rel}")
            elif digest(path) != want:
                bad.append(f"differs  api/{svc}/{rel}  (canonical: api/{CANONICAL}/{rel})")
    for line in bad:
        print(line)
    print(f"{len(SHARED)} shared files checked, {len(bad)} problem(s)")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
