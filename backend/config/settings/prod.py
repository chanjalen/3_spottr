"""
Django production settings for Spottr project.

These settings are for production deployment.
"""

import os
from .base import *

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = False

# Add your production domain(s) here
ALLOWED_HOSTS = os.getenv('ALLOWED_HOSTS', '').split(',')

# Security settings for production
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000  # 1 year
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# Production database (configure via environment variables)
DATABASES = {
    "default": {
        "ENGINE": os.getenv('DB_ENGINE', 'django.db.backends.postgresql'),
        "NAME": os.getenv('DB_NAME', 'spottr'),
        "USER": os.getenv('DB_USER', ''),
        "PASSWORD": os.getenv('DB_PASSWORD', ''),
        "HOST": os.getenv('DB_HOST', 'localhost'),
        "PORT": os.getenv('DB_PORT', '5432'),
        "OPTIONS": {
            # Enforce TLS for all production DB connections
            "sslmode": os.getenv('DB_SSLMODE', 'require'),
        },
    }
}

# Static files
STATIC_ROOT = BASE_DIR / 'staticfiles'

# Cache — use Redis in production so cache is shared across all workers.
# Set REDIS_URL in environment (e.g. redis://localhost:6379/1).
_redis_url = os.getenv('REDIS_URL')
if _redis_url:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.redis.RedisCache',
            'LOCATION': _redis_url,
        }
    }
# If REDIS_URL is not set, base.py LocMemCache is used — acceptable for single-worker deploys.

# Logging — raise all app loggers to WARNING in production to reduce noise.
LOGGING['loggers'].update({
    'accounts': {'handlers': ['console'], 'level': 'WARNING', 'propagate': False},
    'social': {'handlers': ['console'], 'level': 'WARNING', 'propagate': False},
    'workouts': {'handlers': ['console'], 'level': 'WARNING', 'propagate': False},
    'groups': {'handlers': ['console'], 'level': 'WARNING', 'propagate': False},
    'gyms': {'handlers': ['console'], 'level': 'WARNING', 'propagate': False},
    'notifications': {'handlers': ['console'], 'level': 'WARNING', 'propagate': False},
    'media': {'handlers': ['console'], 'level': 'WARNING', 'propagate': False},
})

# Email configuration (configure via environment variables)
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = os.getenv('EMAIL_HOST', '')
EMAIL_PORT = int(os.getenv('EMAIL_PORT', 587))
EMAIL_USE_TLS = True
EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.getenv('EMAIL_HOST_PASSWORD', '')
