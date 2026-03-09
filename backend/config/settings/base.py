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
    "organizations",
    "storages",
]

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
        "CONN_MAX_AGE": 0,   # release immediately — required for Supabase Session-mode pooler (port 6543)
        "OPTIONS": {
            "sslmode": os.environ.get("DB_SSLMODE", "require"),
        },
    }
}

# Password hashing — Argon2 is the primary hasher; PBKDF2 stays as fallback so
# existing passwords continue to work and are transparently upgraded on next login.
PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.Argon2PasswordHasher',
    'django.contrib.auth.hashers.PBKDF2PasswordHasher',
]

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
        'OPTIONS': {'min_length': 10},
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
    {
        'NAME': 'accounts.validators.PasswordComplexityValidator',
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
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        # Global fallback — catches any endpoint not explicitly throttled
        'anon': '60/minute',
        'user': '300/minute',
        # Auth endpoints — brute-force / email-abuse guards
        'auth': '10/minute',
        'resend_verification': '3/hour',
        # Messaging
        'message': '30/minute',
        'zap': '5/minute',
        'reaction': '60/minute',
        # Social writes (posts, check-ins)
        'social_write': '20/minute',
        # Follow / unfollow
        'follow': '60/minute',
        # User search / username enumeration
        'search': '30/minute',
        # Entity creation (groups, orgs)
        'create': '30/hour',
        # File uploads
        'upload': '20/hour',
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
CELERY_BEAT_SCHEDULE = {
    'reset-broken-streaks-hourly': {
        'task': 'workouts.tasks.reset_broken_streaks',
        'schedule': 3600,  # every hour (UTC) — catches each user's 3 AM window
    },
    'send-gym-reminders-hourly': {
        'task': 'accounts.tasks.send_gym_reminders',
        'schedule': 3600,  # runs every hour; internally fires at 9am/12pm/6pm per user's local time
    },
}

# Email — from address used for all outgoing mail
# Using Resend's shared sender until spottr.app domain is verified.
# Switch back to 'Spottr <noreply@spottr.app>' after DNS verification.
DEFAULT_FROM_EMAIL = os.getenv('DEFAULT_FROM_EMAIL', 'Spottr <onboarding@resend.dev>')

# Google OAuth client IDs — the token's `aud` claim matches whichever platform
# credential was used, so all three are needed for multi-platform support.
GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID', '')              # Web client ID
GOOGLE_IOS_CLIENT_ID = os.getenv('GOOGLE_IOS_CLIENT_ID', '')      # iOS production client ID
GOOGLE_IOS_DEV_CLIENT_ID = os.getenv('GOOGLE_IOS_DEV_CLIENT_ID', '')  # iOS dev build client ID
GOOGLE_ANDROID_CLIENT_ID = os.getenv('GOOGLE_ANDROID_CLIENT_ID', '')  # Android client ID

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
