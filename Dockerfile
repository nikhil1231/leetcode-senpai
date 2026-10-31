FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.11.6 /uv /usr/local/bin/uv

ENV PYTHONUNBUFFERED=1 \
    PORT=8080 \
    PATH="/app/.venv/bin:$PATH" \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app

COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --locked --no-dev --no-cache

# The podcast's two Piper voices (open licences, ~63 MB each), fetched once per image build.
ENV PODCAST_VOICES=/app/voices PODCAST_DIR=/tmp/senpai-podcast
RUN python -c "import urllib.request as u, os; os.makedirs('/app/voices'); \
[u.urlretrieve(f'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_GB/{v}/medium/en_GB-{v}-medium.onnx{x}', f'/app/voices/en_GB-{v}-medium.onnx{x}') \
 for v in ('alan', 'jenny_dioco') for x in ('', '.json')]"

COPY server ./server
COPY static ./static

# Cloud Run injects $PORT. STORE_BACKEND defaults to firestore in prod.
CMD exec uvicorn server.main:app --host 0.0.0.0 --port ${PORT}
