"""
Django settings for Spottr on PythonAnywhere (SQLite, no Redis/Celery required).
"""

import os
from pathlib import Path
from .base import *

DEBUG = False

ALLOWED_HOSTS = [
    os.getenv('PYTHONANYWHERE_DOMAIN', ''),
    'localhost',
    '127.0.0.1',
]

# ── Database — SQLite for PythonAnywhere deployment ───────────────────────────
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

# ── Static files ──────────────────────────────────────────────────────────────
STATIC_ROOT = BASE_DIR / 'staticfiles'

# ── Disable SSL redirect (PythonAnywhere handles HTTPS at proxy level) ────────
SECURE_SSL_REDIRECT = False
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False

# ── Storage — use local filesystem instead of Supabase S3 ────────────────────
DEFAULT_FILE_STORAGE = 'django.core.files.storage.FileSystemStorage'
MEDIA_ROOT = BASE_DIR / 'media_uploads'
MEDIA_URL = '/media/'

# ── Channel layer — in-memory (no Redis needed) ───────────────────────────────
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels.layers.InMemoryChannelLayer',
    }
}

# ── Celery — disable task broker (not needed for basic deployment) ────────────
CELERY_TASK_ALWAYS_EAGER = True

# ── Email — console backend (no SMTP config needed) ──────────────────────────
EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

# ── CSRF trusted origins ──────────────────────────────────────────────────────
_domain = os.getenv('PYTHONANYWHERE_DOMAIN', '')
if _domain:
    CSRF_TRUSTED_ORIGINS = [f'https://{_domain}']
