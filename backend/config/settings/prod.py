"""
Django production settings for Spottr project.

These settings are for production deployment.
"""

import os
from .base import *

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = False

# Add your production domain/IP here via ALLOWED_HOSTS env var (comma-separated)
ALLOWED_HOSTS = os.getenv('ALLOWED_HOSTS', '').split(',')

# CORS — allow the mobile app to reach the API
CORS_ALLOW_ALL_ORIGINS = True

# CSRF trusted origins — required for Django admin over HTTP during beta
CSRF_TRUSTED_ORIGINS = [
    f"http://{host}" for host in os.getenv('ALLOWED_HOSTS', '').split(',') if host
]

# Security headers (safe for HTTP)
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'

# SSL/HTTPS
SECURE_SSL_REDIRECT = True
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# Static files — WhiteNoise serves them directly from Daphne (no separate nginx rule needed)
STATIC_ROOT = BASE_DIR / 'staticfiles'

STORAGES = {
    **STORAGES,
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

# Insert WhiteNoise middleware right after SecurityMiddleware
MIDDLEWARE = list(MIDDLEWARE)
MIDDLEWARE.insert(1, 'whitenoise.middleware.WhiteNoiseMiddleware')

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
            "sslmode": os.getenv('DB_SSLMODE', 'require'),
        },
    }
}

# Cache — use Redis in production so cache is shared across all workers.
_redis_url = os.getenv('REDIS_URL')
if _redis_url:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.redis.RedisCache',
            'LOCATION': _redis_url,
        }
    }

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
