from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    TourListView, 
    TourDetailView,
    TourPOIListCreateView,
    TourPOIDetailView,
    TourPOIGroupedView,
    TourReviewViewSet,
)

app_name = 'tours'

router = DefaultRouter()
router.register(r'reviews', TourReviewViewSet, basename='tour-review')

urlpatterns = [
    path('', TourListView.as_view(), name='tour-list'),
    path('<int:pk>/', TourDetailView.as_view(), name='tour-detail'),
    path('tour-pois/', TourPOIGroupedView.as_view(), name='tour-poi-grouped'),
    path('pois/', TourPOIListCreateView.as_view(), name='tour-poi-list'),
    path('pois/<int:pk>/', TourPOIDetailView.as_view(), name='tour-poi-detail'),
    path('', include(router.urls)),
]