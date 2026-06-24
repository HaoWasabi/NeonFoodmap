from django.urls import path

from . import views

app_name = 'payments'

urlpatterns = [
    path('invoices/', views.InvoiceListCreateView.as_view(), name='invoice-list-create'),
    path('invoices/<uuid:pk>/', views.InvoiceDetailView.as_view(), name='invoice-detail'),
    path('paypal/create-order/', views.paypal_create_order, name='paypal-create-order'),
    path('paypal/capture-order/<str:order_id>/', views.paypal_capture_order, name='paypal-capture-order'),
    # Premium Tour
    path('tour-purchase/', views.tour_purchase_create, name='tour-purchase-create'),
    path('tour-purchase/check/', views.tour_purchase_check, name='tour-purchase-check'),
    # Premium Partner
    path('partner-premium/', views.partner_premium_purchase_create, name='partner-premium-create'),
    path('partner-premium/check/', views.partner_premium_purchase_check, name='partner-premium-check'),
]
