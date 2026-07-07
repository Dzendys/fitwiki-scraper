# FitWiki Context Scraper

A modern, responsive dark-themed dashboard designed to scrape study materials, lectures, exam variants, and attachments from DokuWiki portals directly into Markdown and PDF formats.

## Description

FitWiki Context Scraper is a web client interface that connects directly to the core `fitwiki` library. It enables students to browse courses, select specific material categories (exams, tests, homework), download them concurrently, and organize them cleanly.

## Key Features

- **Interactive Import Board:** Watch imports in real-time with visual cards transitioning across states (*Waiting*, *Downloading*, *Completed*, *Failed*), featuring custom badges (`MD`, `PDF`, `ZIP`) and inline error trace details.
- **Direct Attachment Handling:** Automatically intercepts binary media attachments (like ZIPs, RARs, PDFs), saving them raw to disk, and adding a direct download action in the file browser.
- **Flat ZIP Archive Exports:** Packages downloaded materials into a flat ZIP folder (files stored directly in the root of the archive) with all zip/rar attachments preserved under all configuration choices.
- **Clean UI & Responsive Layout:** Stretched height-symmetrical grids, full-height file browser, cache-busting file listings, and dark glassmorphic styling.
- **Cleanup Utilities:** Single-click UI action button to wipe out all downloaded materials and clear the local scraping caches on demand.

## Installation & Setup

### 1. Using Docker Compose (Recommended)

To run the web service in a sandboxed container, you can choose one of the following methods:

**Option A: Using Docker Compose (Recommended)**
Create a `docker-compose.yml` file:

```yaml
services:
  fitwiki-scraper:
    image: ghcr.io/dzendys/fitwiki-scraper:latest
    container_name: fitwiki-scraper
    ports:
      - "5000:5000"
    env_file:
      - .env
    volumes:
      - ./downloads:/app/downloads
    restart: unless-stopped
```

Prepare your `.env` file from the example (`cp .env.example .env`) and start the service:

```bash
docker compose up -d
```

**Option B: Using Docker Run**
Prepare your `.env` file from the example (`cp .env.example .env`) and run the container:

```bash
docker run -d \
  --name fitwiki-scraper \
  -p 5000:5000 \
  --env-file .env \
  -v ./downloads:/app/downloads \
  --restart unless-stopped \
  ghcr.io/dzendys/fitwiki-scraper:latest
```

The application will be accessible at `http://localhost:5000`. Your downloaded materials will be persistently synchronized inside the `./downloads` folder on your host machine.

### 2. Local Python Environment

To run the Flask application locally on your machine:

1. Clone the repository and its submodules:
   ```bash
   git clone --recursive <REPOSITORY_URL> && cd fitwiki-context-scraper
   ```

2. Create a virtual environment and install dependencies:
   ```bash
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

3. Configure your local environment in a `.env` file:
   ```env
   FITWIKI_CORE_PATH=/path/to/your/local/fitwiki
   FLASK_HOST=127.0.0.1
   FLASK_PORT=5000
   FLASK_DEBUG=True
   ```
   *(By default, it will fall back to using the submodule folder `lib/fitwiki` if no `.env` value is supplied).*

4. Run the app:
   ```bash
   python app.py
   ```

## Configuration (Environment Variables)

The application can be fully configured using the following environment variables:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `FITWIKI_CORE_PATH` | Absolute path to the core `fitwiki` library directory (uses `lib/fitwiki` submodule if not set) | `lib/fitwiki` |
| `FLASK_HOST` | Host address the Flask web server binds to | `127.0.0.1` (`0.0.0.0` in Docker) |
| `FLASK_PORT` | Port the Flask web server listens on | `5000` |
| `FLASK_DEBUG` | Toggle Flask debug mode reload and verbose errors | `True` (`False` in Docker) |
| `FITWIKI_COOKIES` | DokuWiki session cookie for private page access (e.g. `DokuWiki=abc...`) | *None* |
| `FITWIKI_BASE_URL` | Base URL of the student Fit-Wiki portal | `https://fit-wiki.cz` |
| `FITWIKI_DELAY` | Rate-limiting delay (in seconds) between HTTP requests | `1.0` |
