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
    }
}

# Static files
STATIC_ROOT = BASE_DIR / 'staticfiles'

# Email configuration (configure via environment variables)
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = os.getenv('EMAIL_HOST', '')
EMAIL_PORT = int(os.getenv('EMAIL_PORT', 587))
EMAIL_USE_TLS = True
EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.getenv('EMAIL_HOST_PASSWORD', '')
