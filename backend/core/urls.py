from django.urls import path
from . import views

app_name = 'core'

urlpatterns = [
    path('', views.api_root, name='api-root'),
    path('health/', views.health_check, name='health-check'),
]
