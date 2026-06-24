from django.apps import AppConfig


class PoisConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'pois'

    def ready(self):
        import pois.signals  # noqa: F401 — kết nối signals
