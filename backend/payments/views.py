import uuid

import requests
from django.conf import settings
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .models import Invoice, PartnerPremiumPurchase, TourPurchase
from .models import get_partner_premium_price_vnd
from .paypal import ensure_usd_payload, paypal_request
from .serializers import InvoiceCreateSerializer, InvoiceSerializer


class InvoiceListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.AllowAny]
    
    def get_queryset(self):
        return Invoice.objects.all().order_by('-created_at')
    
    def get_serializer_class(self):
        if self.request.method == 'POST':
            return InvoiceCreateSerializer
        return InvoiceSerializer
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        invoice = serializer.save()
        return Response(InvoiceSerializer(invoice).data, status=201)


class InvoiceCreateView(generics.CreateAPIView):
    serializer_class = InvoiceCreateSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        invoice = serializer.save()
        return Response(InvoiceSerializer(invoice).data, status=201)


class InvoiceDetailView(generics.RetrieveAPIView):
    queryset = Invoice.objects.all()
    serializer_class = InvoiceSerializer
    permission_classes = [permissions.AllowAny]


def _sync_partner_premium_entitlement(invoice: Invoice) -> None:
    purchase = getattr(invoice, 'partner_premium_purchase', None)
    if not purchase or invoice.status != Invoice.Status.SUCCESS:
        return

    try:
        from pois.models import Partner

        partner = Partner.objects.select_related('poi').filter(user=purchase.user).first()
        if partner and partner.poi_id:
            partner.poi.save(update_fields=['updated_at'])
    except Exception:
        # Entitlement should not fail the payment flow if POI sync has issues.
        return


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def paypal_create_order(request):
    invoice_id = request.data.get('invoiceId', '')

    if not invoice_id:
        return Response({'error': 'invoiceId is required.'}, status=400)

    try:
        uuid.UUID(str(invoice_id))
    except ValueError:
        return Response({'error': 'invoiceId is invalid.'}, status=400)

    if not settings.PAYPAL_CLIENT_ID or not settings.PAYPAL_SECRET:
        return Response({'error': 'PayPal is not configured.'}, status=500)

    invoice = get_object_or_404(Invoice, id=invoice_id)
    if invoice.status == Invoice.Status.SUCCESS:
        return Response({'error': 'Invoice is already paid.'}, status=400)

    payload = {
        'intent': 'CAPTURE',
        'purchase_units': [
            {
                'reference_id': str(invoice.id),
                'description': invoice.reason,
                'amount': {
                    'currency_code': 'VND',
                    'value': str(int(invoice.amount)),
                },
            }
        ],
    }

    # Try VND first; if PayPal rejects (422), fallback to USD
    try:
        result = paypal_request('POST', '/v2/checkout/orders', json=payload)
    except requests.exceptions.HTTPError as e:
        if e.response is not None and e.response.status_code == 422:
            print("[PayPal] 422 error, retrying with USD fallback")
            payload_usd = ensure_usd_payload(payload.copy())
            result = paypal_request('POST', '/v2/checkout/orders', json=payload_usd)
        else:
            raise
    order_id = str(result.get('id', ''))

    if order_id:
        invoice.transaction_code = order_id
        invoice.save(update_fields=['transaction_code'])

    return Response(result)


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def paypal_capture_order(request, order_id: str):
    if not settings.PAYPAL_CLIENT_ID or not settings.PAYPAL_SECRET:
        return Response({'error': 'PayPal is not configured.'}, status=500)

    invoice = Invoice.objects.filter(transaction_code=order_id).first()
    if not invoice:
        invoice_id = request.data.get('invoiceId', '')
        if invoice_id:
            invoice = Invoice.objects.filter(id=invoice_id).first()

    result = paypal_request('POST', f"/v2/checkout/orders/{order_id}/capture")

    status = str(result.get('status', ''))
    if invoice:
        if status == 'COMPLETED':
            invoice.status = Invoice.Status.SUCCESS
            invoice.paid_at = timezone.now()
            invoice.transaction_code = order_id
            invoice.save(update_fields=['status', 'paid_at', 'transaction_code'])
            _sync_partner_premium_entitlement(invoice)
        else:
            invoice.status = Invoice.Status.FAILED
            invoice.transaction_code = order_id
            invoice.save(update_fields=['status', 'transaction_code'])

    return Response(result)


# ── Premium Tour Purchase ─────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def tour_purchase_create(request):
    """
    POST /api/payments/tour-purchase/
    Body: { "tour_id": <int> }
    Tạo Invoice + TourPurchase (PENDING) cho tour premium.
    Trả về invoice_id để frontend dùng PayPal flow.
    """
    from tours.models import Tour

    tour_id = request.data.get('tour_id')
    if not tour_id:
        return Response({'error': 'tour_id is required.'}, status=400)

    tour = get_object_or_404(Tour, id=tour_id, status=Tour.Status.ACTIVE)

    if not tour.is_premium:
        return Response({'error': 'Tour này không phải Premium.'}, status=400)

    if not tour.premium_price or tour.premium_price <= 0:
        return Response({'error': 'Tour chưa thiết lập giá premium.'}, status=400)

    # Kiểm tra xem đã có bản ghi TourPurchase nào chưa
    existing = TourPurchase.objects.filter(user=request.user, tour=tour).first()
    
    if existing:
        if existing.invoice and existing.invoice.status == Invoice.Status.SUCCESS:
            return Response({'error': 'Bạn đã mua tour này rồi.', 'already_purchased': True}, status=400)
            
        # Nếu đang PENDING, trả về invoice cũ để tiếp tục thanh toán
        if existing.invoice and existing.invoice.status == Invoice.Status.PENDING:
            # Price may have changed after a previous pending invoice was created.
            # Keep pending invoice aligned with current tour premium price.
            if existing.invoice.amount != tour.premium_price:
                existing.invoice.amount = tour.premium_price
                existing.invoice.reason = f'Mua tour premium: {tour.tour_name}'
                # Clear previous order reference so frontend creates a fresh PayPal order.
                existing.invoice.transaction_code = ''
                existing.invoice.save(update_fields=['amount', 'reason', 'transaction_code'])
            return Response({
                'invoice_id': str(existing.invoice.id),
                'tour_purchase_id': str(existing.id),
                'amount': existing.invoice.amount,
                'tour_name': tour.tour_name,
            }, status=200)

        # Nếu FAILED hoặc CANCELLED, tạo invoice mới và cập nhật bản ghi cũ
        invoice = Invoice.objects.create(
            user=request.user,
            reason=f'Mua tour premium: {tour.tour_name}',
            amount=tour.premium_price,
        )
        existing.invoice = invoice
        existing.save(update_fields=['invoice'])
        
        return Response({
            'invoice_id': str(invoice.id),
            'tour_purchase_id': str(existing.id),
            'amount': invoice.amount,
            'tour_name': tour.tour_name,
        }, status=201)

    # Nếu chưa từng có, tạo mới hoàn toàn
    invoice = Invoice.objects.create(
        user=request.user,
        reason=f'Mua tour premium: {tour.tour_name}',
        amount=tour.premium_price,
    )
    purchase = TourPurchase.objects.create(
        user=request.user,
        tour=tour,
        invoice=invoice,
    )

    return Response({
        'invoice_id': str(invoice.id),
        'tour_purchase_id': str(purchase.id),
        'amount': invoice.amount,
        'tour_name': tour.tour_name,
    }, status=201)


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def tour_purchase_check(request):
    """
    GET /api/payments/tour-purchase/check/?tour_id=<int>
    Kiểm tra user đã mua tour premium chưa.
    """
    tour_id = request.query_params.get('tour_id')
    if not tour_id:
        return Response({'error': 'tour_id query param is required.'}, status=400)

    purchased = TourPurchase.objects.filter(
        user=request.user,
        tour_id=tour_id,
        invoice__status='SUCCESS',
    ).exists()

    return Response({'purchased': purchased})


# ── Premium Partner Purchase ──────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def partner_premium_purchase_create(request):
    """
    POST /api/payments/partner-premium/
    Tạo Invoice + PartnerPremiumPurchase (PENDING) cho tài khoản partner.
    """
    from pois.models import Partner

    partner = Partner.objects.filter(user=request.user).first()
    if not partner:
        return Response({'error': 'Bạn chưa có hồ sơ partner.'}, status=400)

    amount = get_partner_premium_price_vnd()
    if amount <= 0:
        return Response({'error': 'Giá premium partner chưa được cấu hình.'}, status=400)

    existing = PartnerPremiumPurchase.objects.filter(user=request.user).select_related('invoice').first()
    if existing and existing.invoice and existing.invoice.status == Invoice.Status.SUCCESS:
        return Response({'error': 'Bạn đã mở khóa premium partner rồi.', 'already_purchased': True}, status=400)

    reason = f'Mua gói premium partner: {partner.business_name}'

    if existing and existing.invoice and existing.invoice.status == Invoice.Status.PENDING:
        if existing.invoice.amount != amount:
            existing.invoice.amount = amount
            existing.invoice.reason = reason
            existing.invoice.transaction_code = ''
            existing.invoice.save(update_fields=['amount', 'reason', 'transaction_code'])
        return Response({
            'invoice_id': str(existing.invoice.id),
            'partner_premium_purchase_id': str(existing.id),
            'amount': existing.invoice.amount,
            'partner_name': partner.business_name,
        }, status=200)

    invoice = Invoice.objects.create(
        user=request.user,
        reason=reason,
        amount=amount,
    )

    if existing:
        existing.invoice = invoice
        existing.save(update_fields=['invoice'])
        purchase = existing
    else:
        purchase = PartnerPremiumPurchase.objects.create(
            user=request.user,
            invoice=invoice,
        )

    return Response({
        'invoice_id': str(invoice.id),
        'partner_premium_purchase_id': str(purchase.id),
        'amount': invoice.amount,
        'partner_name': partner.business_name,
    }, status=201)


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def partner_premium_purchase_check(request):
    """
    GET /api/payments/partner-premium/check/
    Kiểm tra partner đã mua premium chưa.
    """
    purchased = PartnerPremiumPurchase.objects.filter(
        user=request.user,
        invoice__status=Invoice.Status.SUCCESS,
    ).exists()
    return Response({'purchased': purchased})
