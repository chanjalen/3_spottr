"""
Test settings for Spottr.

Overrides the base settings to use:
- SQLite in-memory (fast, no Postgres needed)
- InMemoryChannelLayer (no Redis needed)
- A throw-away SECRET_KEY
- Celery tasks run eagerly (inline, no worker needed)

Run tests with:
    DJANGO_SETTINGS_MODULE=config.settings.test python manage.py test messaging
"""

import os

# Must be set before importing base.py, which raises if SECRET_KEY is missing.
os.environ.setdefault('SECRET_KEY', 'django-insecure-test-key-only-for-tests-never-use-in-prod')

from .base import *  # noqa: F401, F403, E402

# ── Database ─────────────────────────────────────────────────────────────────
# Reuse the PostgreSQL connection from base.py (env vars / .env).
# Django will create an isolated test_<dbname> database automatically.
# SQLite is not used because some migrations contain Postgres-only SQL.

# ── Channel layer ─────────────────────────────────────────────────────────────
# Replace Redis with an in-memory layer so tests never need a running Redis.

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer",
    }
}

# ── Celery ────────────────────────────────────────────────────────────────────
# Run tasks synchronously so we don't need a worker.

CELERY_TASK_ALWAYS_EAGER = True

# ── Password hashing ──────────────────────────────────────────────────────────
# MD5 is weak but lightning-fast — fine for test fixtures.

PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

# ── Logging ───────────────────────────────────────────────────────────────────
# Suppress all log output during tests.

LOGGING["root"]["level"] = "CRITICAL"
