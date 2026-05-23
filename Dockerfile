FROM python:3.11-slim

WORKDIR /app

# Python deps first (better layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App source
COPY gateway/ ./gateway/
COPY agentgate_sdk/ ./agentgate_sdk/
COPY agent/ ./agent/

EXPOSE 8000

CMD ["uvicorn", "gateway.main:app", "--host", "0.0.0.0", "--port", "8000"]
