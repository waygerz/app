FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    FLASK_APP=wsgi.py

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# gthread, not sync: these handlers spend most of their time waiting on the DB,
# Redis, or another service, and a bare `--workers 1` sync worker serves exactly
# one request at a time. Behind Service Connect (no ALB queue to absorb the
# pile-up) that serialization turns concurrent callers into 10s read timeouts.
CMD ["gunicorn", "-b", "0.0.0.0:8000", "wsgi:app", "--workers", "1", "--threads", "8", "--worker-class", "gthread", "--timeout", "120"]