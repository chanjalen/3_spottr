FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Production: collect static files, run migrations, start Daphne (ASGI server for Channels).
# Dev compose.yml overrides this CMD with runserver.
CMD ["sh", "-c", "python manage.py collectstatic --noinput && python manage.py migrate && daphne -b 0.0.0.0 -p 8000 config.asgi:application"]
