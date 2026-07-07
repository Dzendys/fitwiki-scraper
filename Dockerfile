FROM python:3.10-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    FITWIKI_CORE_PATH=/app/lib/fitwiki \
    FLASK_HOST=0.0.0.0 \
    FLASK_PORT=5000 \
    FLASK_DEBUG=false

WORKDIR /app

# Install system dependencies for document compiling (Pango, Harfbuzz, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3-dev \
    libpango-1.0-0 \
    libharfbuzz0b \
    libpangoft2-1.0-0 \
    libffi-dev \
    shared-mime-info \
    && rm -rf /var/lib/apt/lists/*

# Copy and install dependencies
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files (including the lib/fitwiki submodule if populated)
COPY . /app/

# Expose the Flask port
EXPOSE 5000

# Start Flask app
CMD ["python", "app.py"]
