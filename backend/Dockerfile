FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# manage.py runserver uses Daphne (ASGI) automatically since daphne is in INSTALLED_APPS
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
