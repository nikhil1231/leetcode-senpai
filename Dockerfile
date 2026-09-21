FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.11.6 /uv /usr/local/bin/uv

ENV PYTHONUNBUFFERED=1 \
    PORT=8080 \
    PATH="/app/.venv/bin:$PATH" \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app

COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --locked --no-dev --no-cache

COPY server ./server
COPY static ./static

# Cloud Run injects $PORT. STORE_BACKEND defaults to firestore in prod.
CMD exec uvicorn server.main:app --host 0.0.0.0 --port ${PORT}
