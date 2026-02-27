"""
Django base settings for Spottr project.

This file contains settings common to all environments.
Environment-specific settings are in dev.py and prod.py.
"""

import os
from pathlib import Path
from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv


# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Load environment variables from .env file
load_dotenv(BASE_DIR / "backend" / ".env")

# SECURITY WARNING: keep the secret key used in production secret!
# Must be set via SECRET_KEY environment variable — no fallback allowed.
SECRET_KEY = os.environ.get('SECRET_KEY')
if not SECRET_KEY:
    raise ImproperlyConfigured("SECRET_KEY environment variable is not set.")

# Application definition
INSTALLED_APPS = [
    "daphne",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "rest_framework.authtoken",
    "channels",
    "accounts",
    "workouts",
    "social",
    "media",
    "gyms",
    "groups",
    "messaging",
    "notifications",
    "storages",
    # Google OAuth (django-allauth)
    "django.contrib.sites",
    "allauth",
    "allauth.account",
    "allauth.socialaccount",
    "allauth.socialaccount.providers.google",
]

SITE_ID = 1

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "common.middleware.TokenAuthMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "allauth.account.middleware.AccountMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR.parent / "frontend" / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
                "gyms.context_processors.gyms_context",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# Database
import os

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("DB_NAME"),
        "USER": os.environ.get("DB_USER"),
        "PASSWORD": os.environ.get("DB_PASSWORD"),
        "HOST": os.environ.get("DB_HOST"),
        "PORT": os.environ.get("DB_PORT", "6543"),
        "CONN_MAX_AGE": 60,  # reuse connections for up to 60 s (eliminates per-request TCP handshake)
        "OPTIONS": {
            "sslmode": os.environ.get("DB_SSLMODE", "require"),
        },
    }
}

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

# Internationalization
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript, Images)
STATIC_URL = "static/"
STATICFILES_DIRS = []

# Default primary key field type
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Custom user model
AUTH_USER_MODEL = 'accounts.User'

# Authentication
LOGIN_URL = '/accounts/login/'
LOGIN_REDIRECT_URL = '/'
LOGOUT_REDIRECT_URL = '/'

AUTHENTICATION_BACKENDS = [
    # Default Django backend (username/password)
    'django.contrib.auth.backends.ModelBackend',
    # allauth backend (Google OAuth)
    'allauth.account.auth_backends.AuthenticationBackend',
]

# django-allauth configuration
ACCOUNT_EMAIL_VERIFICATION = 'none'
ACCOUNT_USERNAME_REQUIRED = True
ACCOUNT_EMAIL_REQUIRED = True
ACCOUNT_UNIQUE_EMAIL = True
ACCOUNT_LOGIN_REDIRECT_URL = '/'
ACCOUNT_LOGOUT_REDIRECT_URL = '/accounts/login/'

SOCIALACCOUNT_ADAPTER = 'accounts.adapters.SocialAccountAdapter'
SOCIALACCOUNT_EMAIL_VERIFICATION = 'none'
SOCIALACCOUNT_AUTO_SIGNUP = True
SOCIALACCOUNT_LOGIN_ON_GET = True  # Skip allauth's intermediate "confirm" page

SOCIALACCOUNT_PROVIDERS = {
    'google': {
        'SCOPE': ['profile', 'email'],
        'AUTH_PARAMS': {'access_type': 'online'},
        'APP': {
            'client_id': os.environ.get('GOOGLE_CLIENT_ID', ''),
            'secret': os.environ.get('GOOGLE_CLIENT_SECRET', ''),
            'key': '',
        },
    }
}

# Media files (user uploads) — Supabase S3 storage
STORAGES = {
    "default": {
        "BACKEND": "storages.backends.s3boto3.S3Boto3Storage",
    },
    "staticfiles": {
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
    },
}

AWS_S3_ENDPOINT_URL = os.environ.get("SUPABASE_S3_ENDPOINT")
AWS_ACCESS_KEY_ID = os.environ.get("SUPABASE_S3_ACCESS_KEY")
AWS_SECRET_ACCESS_KEY = os.environ.get("SUPABASE_S3_SECRET_KEY")
AWS_STORAGE_BUCKET_NAME = os.environ.get("SUPABASE_S3_BUCKET", "Media_Uploads")
AWS_S3_REGION_NAME = "us-east-1"
AWS_DEFAULT_ACL = "public-read"
AWS_QUERYSTRING_AUTH = False

# Build the public URL domain for serving media.
# S3 endpoint: https://<ref>.storage.supabase.co/storage/v1/s3
# Public URL:  https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<path>
_s3_endpoint = os.environ.get("SUPABASE_S3_ENDPOINT", "")
_project_ref = _s3_endpoint.split("//")[-1].split(".")[0] if _s3_endpoint else ""
_bucket = os.environ.get("SUPABASE_S3_BUCKET", "Media_Uploads")
AWS_S3_CUSTOM_DOMAIN = f"{_project_ref}.supabase.co/storage/v1/object/public/{_bucket}"

MEDIA_URL = f"https://{AWS_S3_CUSTOM_DOMAIN}/"
MEDIA_ROOT = BASE_DIR / 'media_uploads'

# Django REST Framework
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.TokenAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_THROTTLE_RATES': {
        # Applied to login/signup via AuthRateThrottle — limits brute-force attempts
        'auth': '10/minute',
        # Applied to send_dm / send_group_message — prevents message spam
        'message': '30/minute',
        # Applied to send_zap — zaps are a special action, tighter limit
        'zap': '5/minute',
    },
}

# Cache — overridden in prod.py to use a shared cache (e.g. Redis).
# LocMemCache is in-process only and does not share state across workers.
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'spottr-feed-cache',
        'TIMEOUT': 60,
    }
}

# Django Channels — Redis channel layer for WebSocket broadcasting.
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            'hosts': [os.environ.get('REDIS_URL', 'redis://127.0.0.1:6379')],
        },
    }
}

# Celery — uses Redis DB 1 (channel layer uses DB 0)
_redis_base = os.environ.get('REDIS_URL', 'redis://127.0.0.1:6379')
CELERY_BROKER_URL = _redis_base + '/1'
CELERY_RESULT_BACKEND = _redis_base + '/2'
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = 'UTC'
CELERY_TASK_TRACK_STARTED = True
# Set CELERY_TASK_ALWAYS_EAGER = True in test settings to run tasks inline

# Logging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '[{levelname}] {asctime} {name} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'WARNING',
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': 'WARNING',
            'propagate': False,
        },
        # App loggers — INFO in dev, WARNING+ in prod (overridden in prod.py)
        'accounts': {'handlers': ['console'], 'level': 'INFO', 'propagate': False},
        'social': {'handlers': ['console'], 'level': 'INFO', 'propagate': False},
        'workouts': {'handlers': ['console'], 'level': 'INFO', 'propagate': False},
        'groups': {'handlers': ['console'], 'level': 'INFO', 'propagate': False},
        'gyms': {'handlers': ['console'], 'level': 'INFO', 'propagate': False},
        'notifications': {'handlers': ['console'], 'level': 'INFO', 'propagate': False},
        'media': {'handlers': ['console'], 'level': 'INFO', 'propagate': False},
    },
}
