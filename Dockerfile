FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PORT=8080

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server ./server
COPY static ./static

# Cloud Run injects $PORT. STORE_BACKEND defaults to firestore in prod.
CMD exec uvicorn server.main:app --host 0.0.0.0 --port ${PORT}
