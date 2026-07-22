"""
Django settings for config project.
NeonFoodmap - Ứng dụng thuyết minh du lịch tự động
"""

from pathlib import Path
import os
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent


# Quick-start development settings - unsuitable for production
SECRET_KEY = os.getenv('SECRET_KEY', 'django-insecure-dev-key-change-in-production')

DEBUG = os.getenv('DEBUG', 'False').lower() == 'true'

# 'localhost,127.0.0.1'
ALLOWED_HOSTS_STR = os.getenv('ALLOWED_HOSTS', '*',)
ALLOWED_HOSTS = [h.strip() for h in ALLOWED_HOSTS_STR.split(',') if h.strip()]
if DEBUG:
    ALLOWED_HOSTS += ['.ngrok-free.app', '.ngrok-free.dev']

# Application definition
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    
    # Third party apps
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'cloudinary_storage',
    'cloudinary',
    
    # Local apps
    'users.apps.UsersConfig',
    'core.apps.CoreConfig',
    'pois.apps.PoisConfig',
    'partners.apps.PartnersConfig',
    'tours.apps.ToursConfig',
    'analytics.apps.AnalyticsConfig',
    'payments.apps.PaymentsConfig',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'


# Database - MySQL
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': os.getenv('DB_NAME', 'buocchancoi_db'),
        'USER': os.getenv('DB_USER', 'root'),
        'PASSWORD': os.getenv('DB_PASSWORD', ''),
        'HOST': os.getenv('DB_HOST', 'localhost'),
        'PORT': os.getenv('DB_PORT', '3306'),
        'OPTIONS': {
            'charset': 'utf8mb4',
        },
    }
}


# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
LANGUAGE_CODE = 'vi'
TIME_ZONE = 'Asia/Ho_Chi_Minh'
USE_I18N = True
USE_TZ = True


# Static files (CSS, JavaScript, Images)
STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

MEDIA_URL = 'media/'
MEDIA_ROOT = BASE_DIR / 'media'


# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Custom User model
AUTH_USER_MODEL = 'users.User'


# REST Framework configuration
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '30/minute',
        'user': '100/minute',
    },
    # Không đặt DEFAULT_PAGINATION_CLASS toàn cục để tránh làm vỡ các API list đơn giản.
    # View nào cần pagination thì tự set pagination_class.
}


# Simple JWT configuration
from datetime import timedelta

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=30),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'user_id',
}


# CORS configuration
CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "https://buocchansoida.netlify.app",
]

# Comma-separated, e.g. http://YOUR_EC2_IP:3000 (Docker frontend mapped port)
_cors_extra = os.getenv("CORS_EXTRA_ORIGINS", "")
if _cors_extra.strip():
    CORS_ALLOWED_ORIGINS.extend(
        [o.strip() for o in _cors_extra.split(",") if o.strip()]
    )

CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^https://.*\.ngrok-free\.app$",
    r"^https://.*\.ngrok-free\.dev$", 
]

CORS_ALLOW_CREDENTIALS = True

# CSRF configuration for production
CSRF_TRUSTED_ORIGINS = [
    "https://buocchansoida.netlify.app",
    "https://*.ngrok-free.app",
    "https://*.ngrok-free.dev",
]

_csrf_extra = os.getenv("CSRF_TRUSTED_ORIGINS_EXTRA", "")
if _csrf_extra.strip():
    CSRF_TRUSTED_ORIGINS.extend(
        [o.strip() for o in _csrf_extra.split(",") if o.strip()]
    )


# CORS configuration for allowed headers
from corsheaders.defaults import default_headers

CORS_ALLOW_HEADERS = list(default_headers) + [
    "ngrok-skip-browser-warning",
]


# Cloudinary configuration
CLOUDINARY_URL = os.getenv('CLOUDINARY_URL', '')

if CLOUDINARY_URL:
    import re
    match = re.match(
        r'cloudinary://(?P<key>[^:]+):(?P<secret>[^@]+)@(?P<cloud>.+)',
        CLOUDINARY_URL,
    )
    if match:
        CLOUDINARY_STORAGE = {
            'CLOUD_NAME': match.group('cloud'),
            'API_KEY': match.group('key'),
            'API_SECRET': match.group('secret'),
        }
        DEFAULT_FILE_STORAGE = 'cloudinary_storage.storage.MediaCloudinaryStorage'


# VNPay configuration
VNPAY_TMN_CODE = os.getenv('VNPAY_TMN_CODE', '')
VNPAY_HASH_SECRET = os.getenv('VNPAY_HASH_SECRET', '')
VNPAY_PAY_URL = os.getenv('VNPAY_PAY_URL', 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html')
VNPAY_RETURN_URL = os.getenv('VNPAY_RETURN_URL', 'http://localhost:8000/api/payments/vnpay-return/')
VNPAY_IPN_URL = os.getenv('VNPAY_IPN_URL', 'http://localhost:8000/api/payments/vnpay-ipn/')
VNPAY_FRONTEND_RETURN_URL = os.getenv('VNPAY_FRONTEND_RETURN_URL', 'http://localhost:5173/payment/vnpay-return')

# PayPal configuration
PAYPAL_CLIENT_ID = os.getenv('PAYPAL_CLIENT_ID', '')
PAYPAL_SECRET = os.getenv('PAYPAL_SECRET', '')
PAYPAL_BASE = os.getenv('PAYPAL_BASE', 'https://api-m.sandbox.paypal.com')
VND_TO_USD_RATE = float(os.getenv('PAYPAL_VND_TO_USD_RATE', '25000'))
# Partner premium price is managed in Django Admin (payments.PaymentConfig).

# Reverse proxy (Caddy/nginx) terminating HTTPS — set BEHIND_HTTPS_PROXY=true in production
if os.getenv('BEHIND_HTTPS_PROXY', '').lower() in ('1', 'true', 'yes'):
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    USE_X_FORWARDED_HOST = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True


