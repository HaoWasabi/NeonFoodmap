from django.urls import path
from . import views

app_name = 'pois'

urlpatterns = [
    # POI endpoints
    path('near-me/', views.POINearMeView.as_view(), name='near-me'),
    path('my-poi/', views.PartnerMyPOIView.as_view(), name='my-poi'),
    path('my-poi/cover-image/', views.POICoverImageView.as_view(), name='my-poi-cover-image'),
    path('my-poi/qr-map-url/', views.POIMapQrUrlView.as_view(), name='my-poi-qr-map-url'),
    path('map-qr/resolve/', views.POIMapQrResolveView.as_view(), name='map-qr-resolve'),
    path('scan/', views.POIScanView.as_view(), name='scan'),
    path('<int:pk>/', views.POIDetailView.as_view(), name='detail'),
    path('<int:poi_id>/media/', views.POIMediaView.as_view(), name='media'),
    path('<int:poi_id>/partners/', views.POIPartnersView.as_view(), name='poi-partners'),
]
