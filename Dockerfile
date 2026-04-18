FROM python:3.11-slim

# Install Chrome and dependencies
RUN apt-get update && apt-get install -y \
    chromium-browser \
    chromium-codecs-ffmpeg \
    fonts-liberation \
    libappindicator3-1 \
    libxss1 \
    xdg-utils \
    wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

# Install Python dependencies
RUN pip install --no-cache-dir -q selenium requests webdriver-manager

# Create logs directory
RUN mkdir -p /app/logs && chmod 777 /app/logs

# Make startup script executable
RUN chmod +x start-scraper.sh

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD ps aux | grep -q "[l]ive_odds_scraper_optimized.py" || exit 1

CMD ["python3", "backend/live_odds_scraper_optimized.py"]
