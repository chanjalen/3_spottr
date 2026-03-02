"""
Django development settings for Spottr project.

These settings are for local development only.
"""

from .base import *

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = True

ALLOWED_HOSTS = ["*"]

# Development-specific apps
INSTALLED_APPS += [
    # Add development tools here if needed
    # 'debug_toolbar',
]

# Development database (using SQLite for simplicity) DELETED


# Email backend for development.
# Falls back to console (prints to terminal) unless EMAIL_HOST is configured,
# in which case real SMTP delivery is used so you can test actual emails.
if os.getenv('EMAIL_HOST'):
    EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
    EMAIL_HOST = os.getenv('EMAIL_HOST', '')
    EMAIL_PORT = int(os.getenv('EMAIL_PORT', 587))
    EMAIL_USE_TLS = os.getenv('EMAIL_USE_TLS', 'True') == 'True'
    EMAIL_USE_SSL = os.getenv('EMAIL_USE_SSL', 'False') == 'True'
    EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER', '')
    EMAIL_HOST_PASSWORD = os.getenv('EMAIL_HOST_PASSWORD', '')
else:
    EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

# CORS settings for development (if using frontend on different port)
CORS_ALLOW_ALL_ORIGINS = True

# CSRF trusted origins for development (allows any localhost/IP access)
CSRF_TRUSTED_ORIGINS = [
    'http://localhost:*',
    'http://127.0.0.1:*',
    'http://0.0.0.0:*',
    'http://192.168.*.*:*',
    'http://10.*.*.*:*',
]
