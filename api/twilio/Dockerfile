FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    FLASK_APP=wsgi.py

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# gthread, not sync: the webhook handlers spend most of their time waiting on the
# Twilio REST API (SMS fan-out) or on the caller (voice screening), and a bare
# `--workers 1` sync worker serves one request at a time — Twilio retries on a
# slow webhook, so serialization turns a burst of inbound into failures.
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA

CMD ["gunicorn", "-b", "0.0.0.0:8000", "wsgi:app", "--workers", "1", "--threads", "8", "--worker-class", "gthread", "--timeout", "120"]
