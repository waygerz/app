FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    FLASK_APP=wsgi.py

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Threaded worker: on-demand external fetches (RTS + ESPN) block inline, so serve
# them on threads (shared memory, thread-safe) to avoid head-of-line blocking the
# whole ingestor behind one slow fetch. Also makes the ESPN single-flight effective.
CMD ["gunicorn", "-b", "0.0.0.0:8000", "wsgi:app", "--workers", "1", "--threads", "8", "--timeout", "120"]
