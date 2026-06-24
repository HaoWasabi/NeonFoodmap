from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from . import views

app_name = 'partners'

urlpatterns = [
    # Partner account endpoints
    path('account/register/', views.PartnerRegisterView.as_view(), name='account-register'),
    path('account/login/', views.PartnerTokenObtainPairView.as_view(), name='account-login'),
    path('account/login/refresh/', TokenRefreshView.as_view(), name='account-login-refresh'),
    path('account/logout/', views.PartnerLogoutView.as_view(), name='account-logout'),
    path('account/profile/', views.PartnerProfileView.as_view(), name='account-profile'),
    path('account/deactivate/', views.PartnerDeactivateView.as_view(), name='account-deactivate'),
    path('account/change-password/', views.PartnerChangePasswordView.as_view(), name='account-change-password'),
    path('account/analytics/', views.PartnerAnalyticsView.as_view(), name='account-analytics'),

    # Partner business CRUD endpoints
    path('', views.PartnerListCreateView.as_view(), name='list-create'),
    path('<int:pk>/', views.PartnerDetailCRUDView.as_view(), name='detail-crud'),
    path('<int:pk>/approve/', views.PartnerApproveView.as_view(), name='approve'),
    path('<int:pk>/reject/', views.PartnerRejectView.as_view(), name='reject'),
]
