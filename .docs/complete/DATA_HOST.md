# Data host (`waygerz-data`) — Postgres + Redis

Production Postgres and Redis run as Docker containers on one EC2 instance, not
in ECS and not RDS/ElastiCache.

| | |
|---|---|
| Instance | `waygerz-data`, `i-05d5d3c6de3711767`, t4g.medium (4 GB), Amazon Linux |
| Private IP / DNS | `10.0.11.154` / `pgsql.waygerz.internal` |
| Access | SSM Run Command / Session Manager (no SSH needed) |
| Provisioned | by hand on 2026-07-05 with EC2 user-data (no launch template or IaC) |
| Data | `/data/pgdata` (Postgres), `/data/redis` (Redis AOF) on the instance volume |

## Canonical container commands

The user-data script ran these once at first boot. **It still has
`max_connections=30`; the running `pgsql` was recreated with 100 on 2026-09-18.**
User-data only runs on first boot, so it only matters when building a new host —
use the commands below, not the old user-data.

```bash
mkdir -p /data/pgdata /data/redis

docker run -d --name pgsql --restart unless-stopped -p 5432:5432 \
  -e POSTGRES_USER=waygerz -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" -e POSTGRES_DB=waygerz \
  -v /data/pgdata:/var/lib/postgresql/data postgres:16-alpine \
  postgres -c shared_buffers=64MB -c effective_cache_size=192MB -c work_mem=4MB \
           -c maintenance_work_mem=24MB -c max_connections=100

docker run -d --name redis --restart unless-stopped -p 6379:6379 \
  -v /data/redis:/data redis:7-alpine \
  redis-server --maxmemory 512mb --maxmemory-policy allkeys-lru --appendonly yes
```

`POSTGRES_PASSWORD` is the password inside the SSM SecureString
`/waygerz/DATABASE_URL` that every service reads. Never commit it.

## Connection budget

Settings passed on the command line (`-c ...`) override `postgresql.conf` and
`ALTER SYSTEM`, so changing one means recreating the container (≈10-20s
outage; data is on the volume):

```bash
docker stop -t 30 pgsql && docker rename pgsql pgsql-old
docker run ... (as above, new flags)
docker exec pgsql pg_isready -U waygerz   # then: docker rm pgsql-old
```

Each service caps its SQLAlchemy pool at 1 idle + 3 overflow (ingestor 2 + 4) —
see `SQLALCHEMY_ENGINE_OPTIONS` in every `app/utils/config.py` — so ~13 idle
connections for the whole stack, with room for deploy overlap and one-off tasks.
Check live usage per service with the ingestor's `flask db-stats` (run it via
the deploy workflow: `run_command=db-stats`); connections carry
`application_name` = the service name.
