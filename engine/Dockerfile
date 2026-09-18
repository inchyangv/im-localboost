# Build context is the repository root: docker build -f engine/Dockerfile .
FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY engine/requirements.txt engine/requirements.txt
RUN pip install --no-cache-dir -r engine/requirements.txt
COPY engine/ engine/
COPY shared/ shared/
# Synthetic data and model files are gitignored, so they are regenerated at image build time.
RUN python -m engine.synth --seed 42 --out data/ && python -m engine.train_risk && python -m engine.train_boost
ENV DB_PATH=/data/engine.db
CMD ["sh", "-c", "uvicorn engine.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
