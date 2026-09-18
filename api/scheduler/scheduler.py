"""Poll-loop scheduler — triggers internal /tick endpoints on other services.

No database; compose-network only. Each target service owns the business logic.
"""
import os
import time

import requests

INTERVAL = int(os.environ.get("SCHEDULER_INTERVAL_SECONDS", 30))
TOKEN = os.environ.get("INTERNAL_TOKEN", "dev-internal-token")
HEADERS = {"X-Internal-Token": TOKEN, "Content-Type": "application/json"}

# Every service mounts /internal under its /v1/{group}/{svc} prefix, so each
# default carries it — a bare host:8000 default 404s. Uses the Service Connect
# mesh names; leave these *_URL vars unset in prod.
JOBS = (
    ("contests", f"{os.environ.get('CONTESTS_URL', 'http://contests:8000/v1/gameplay/contests')}/internal/tick"),
    ("leagues", f"{os.environ.get('LEAGUES_URL', 'http://leagues:8000/v1/gameplay/leagues')}/internal/tick"),
    ("ingestor", f"{os.environ.get('INGESTOR_URL', 'http://ingestor:8000/v1/platform/ingestor')}/internal/tick"),
    # users owns the no-favorites nudge.
    ("users", f"{os.environ.get('USERS_URL', 'http://users:8000/v1/platform/users')}/internal/tick"),
)


def _run_job(name: str, url: str) -> None:
    resp = requests.post(url, headers=HEADERS, json={}, timeout=120)
    resp.raise_for_status()
    data = resp.json()
    if any(isinstance(v, int) and v > 0 for v in data.values()):
        print(f"[scheduler] {name}: {data}", flush=True)


def main() -> None:
    print(f"[scheduler] ticking every {INTERVAL}s", flush=True)
    while True:
        for name, url in JOBS:
            try:
                _run_job(name, url)
            except Exception as exc:  # keep the loop alive
                print(f"[scheduler] {name} error: {exc}", flush=True)
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()