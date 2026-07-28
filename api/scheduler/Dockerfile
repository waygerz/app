FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY scheduler.py .

ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA

CMD ["python", "scheduler.py"]