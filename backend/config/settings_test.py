"""
Test settings: in-memory SQLite, fast password hashing, local file storage (no Cloudinary).
Usage: python manage.py test --settings=config.settings_test
"""
from .settings import *  # noqa: F401,F403

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    }
}

PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']

# Avoid Cloudinary / external deps during unit tests
DEFAULT_FILE_STORAGE = 'django.core.files.storage.FileSystemStorage'
MEDIA_ROOT = BASE_DIR / 'media_test'

EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
