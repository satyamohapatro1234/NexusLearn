FROM pytorch/pytorch:2.2.0-cuda12.1-cudnn8-runtime

WORKDIR /app

# System deps for librosa/numba
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 ffmpeg git && \
    rm -rf /var/lib/apt/lists/*

# Install Python deps
COPY vibevoice/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy VibeVoice source + service
COPY vibevoice/ /app/vibevoice/
COPY backend/services/vibevoice_service.py /app/backend/services/vibevoice_service.py

ENV PYTHONPATH=/app
EXPOSE 8195

CMD ["uvicorn", "backend.services.vibevoice_service:app", "--host", "0.0.0.0", "--port", "8195"]
