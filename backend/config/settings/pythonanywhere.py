"""
Django settings for PythonAnywhere deployment.

Uses SQLite, local file storage, and in-memory channel layer.
No Redis, Celery workers, or Supabase S3 required.

Usage:
    python manage.py runserver --settings=config.settings.pythonanywhere
    DJANGO_SETTINGS_MODULE=config.settings.pythonanywhere
"""

import os

# Provide a fallback SECRET_KEY before importing base (which raises if missing).
# On PythonAnywhere, set the real SECRET_KEY as an environment variable instead.
os.environ.setdefault(
    'SECRET_KEY',
    'django-insecure-pythonanywhere-placeholder-replace-with-real-key'
)

from .base import *  # noqa: F401, F403

DEBUG = False

ALLOWED_HOSTS = [
    'aidangilbert.pythonanywhere.com',
    'localhost',
    '127.0.0.1',
]

# Remove daphne — PythonAnywhere uses WSGI, not ASGI
INSTALLED_APPS = [app for app in INSTALLED_APPS if app != 'daphne']  # noqa: F405

# SQLite instead of PostgreSQL
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',  # noqa: F405
    }
}

# Local file storage instead of Supabase S3
STORAGES = {
    'default': {
        'BACKEND': 'django.core.files.storage.FileSystemStorage',
    },
    'staticfiles': {
        'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage',
    },
}

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media_uploads'  # noqa: F405

# In-memory channel layer — no Redis needed
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels.layers.InMemoryChannelLayer',
    }
}

# Run Celery tasks synchronously — no worker needed
CELERY_TASK_ALWAYS_EAGER = True

# Static files — run `python manage.py collectstatic` before deploying
STATIC_ROOT = BASE_DIR / 'staticfiles'  # noqa: F405

# Email
EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

# CORS
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = [
    'https://aidangilbert.pythonanywhere.com',
]

CSRF_TRUSTED_ORIGINS = [
    'https://aidangilbert.pythonanywhere.com',
]