"""
Django settings for Spottr on PythonAnywhere (SQLite, no Redis/Celery required).
"""

import os
from pathlib import Path
from .base import *

DEBUG = True

ALLOWED_HOSTS = [
    os.getenv('PYTHONANYWHERE_DOMAIN', 'aidangilbert.pythonanywhere.com'),
    'localhost',
    '127.0.0.1',
]

# django.contrib.sites — allauth uses this to build OAuth redirect URIs.
# After running migrate, update the Site record in the admin panel:
#   Domain name: aidangilbert.pythonanywhere.com
#   Display name: Spottr
SITE_ID = 1

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

# ── Strip out heavy apps not needed on PythonAnywhere ────────────────────────
# Remove daphne (ASGI server), channels, storages — not used here.
INSTALLED_APPS = [app for app in INSTALLED_APPS if app not in (
    'daphne', 'channels', 'storages',
)]

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
