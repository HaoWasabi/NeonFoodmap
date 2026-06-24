from django.contrib.auth import get_user_model
from django.db.models.signals import post_save, pre_save
from django.test import override_settings
from rest_framework.test import APITestCase

from payments.models import Invoice, PartnerPremiumPurchase
from pois.models import POI, Partner
from pois.signals import handle_poi_translations, track_poi_changes

User = get_user_model()


class PaymentsAPICriticalTests(APITestCase):
    def test_paypal_create_order_requires_invoice_id(self):
        r = self.client.post('/api/payments/paypal/create-order/', {}, format='json')
        self.assertEqual(r.status_code, 400)
        err = (r.data.get('error') or '').lower()
        self.assertIn('invoice', err)

    def test_paypal_create_order_rejects_invalid_uuid(self):
        r = self.client.post(
            '/api/payments/paypal/create-order/',
            {'invoiceId': 'not-a-uuid'},
            format='json',
        )
        self.assertEqual(r.status_code, 400)

    @override_settings(PAYPAL_CLIENT_ID='', PAYPAL_SECRET='')
    def test_paypal_create_order_returns_500_when_paypal_not_configured(self):
        """Deterministic: empty PayPal credentials return 500 (ignores host env / .env)."""
        user = User.objects.create_user(
            username='payer',
            email='payer@example.com',
            password='x',
        )
        inv = Invoice.objects.create(
            user=user,
            amount=1000,
            reason='test',
            status=Invoice.Status.PENDING,
        )
        r = self.client.post(
            '/api/payments/paypal/create-order/',
            {'invoiceId': str(inv.id)},
            format='json',
        )
        self.assertEqual(r.status_code, 500)
        self.assertIn('not configured', str(r.data).lower())


class PartnerPremiumAPITests(APITestCase):
    def setUp(self):
        post_save.disconnect(handle_poi_translations, sender=POI)
        pre_save.disconnect(track_poi_changes, sender=POI)
        self.addCleanup(post_save.connect, handle_poi_translations, POI)
        self.addCleanup(pre_save.connect, track_poi_changes, POI)

        self.user = User.objects.create_user(
            username='partner',
            email='partner@example.com',
            password='StrongPass123!'
        )
        self.poi = POI.objects.create(
            name='POI Partner',
            description='Test POI',
            latitude=10.75,
            longitude=106.70,
            geofence_radius=50,
            category='food',
            qr_code_data='PARTNER-POI-001',
        )
        self.partner = Partner.objects.create(
            user=self.user,
            poi=self.poi,
            business_name='Partner Premium',
            status=Partner.Status.ACTIVE,
        )

    def test_partner_premium_purchase_create_and_check(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.post('/api/payments/partner-premium/', {}, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertTrue(int(response.data['amount']) > 0)

        purchase = PartnerPremiumPurchase.objects.get(user=self.user)
        self.assertEqual(str(purchase.invoice_id), response.data['invoice_id'])

        check_response = self.client.get('/api/payments/partner-premium/check/')
        self.assertEqual(check_response.status_code, 200)
        self.assertFalse(check_response.data['purchased'])

        invoice = purchase.invoice
        invoice.status = Invoice.Status.SUCCESS
        invoice.save(update_fields=['status'])

        check_response = self.client.get('/api/payments/partner-premium/check/')
        self.assertEqual(check_response.status_code, 200)
        self.assertTrue(check_response.data['purchased'])

    def test_partner_premium_is_required_for_my_poi_endpoint(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.get('/api/pois/my-poi/')
        self.assertEqual(response.status_code, 403)

        purchase = PartnerPremiumPurchase.objects.create(user=self.user)
        invoice = Invoice.objects.create(
            user=self.user,
            amount=1000,
            reason='test',
            status=Invoice.Status.SUCCESS,
        )
        purchase.invoice = invoice
        purchase.save(update_fields=['invoice'])

        response = self.client.get('/api/pois/my-poi/')
        self.assertEqual(response.status_code, 200)
