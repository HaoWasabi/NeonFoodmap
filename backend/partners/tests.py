from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from pois.models import POI, Partner


User = get_user_model()


class PartnerApprovalFlowTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email='admin@example.com',
            username='admin',
            password='StrongPass123!'
        )
        self.admin.is_staff = True
        self.admin.save(update_fields=['is_staff'])

        self.poi = POI.objects.create(
            name='POI Test',
            description='Test',
            latitude=10.75,
            longitude=106.70,
            geofence_radius=50,
            category='food',
            qr_code_data='TEST-POI-001',
        )

        self.pending_partner = Partner.objects.create(
            poi=self.poi,
            business_name='Partner Pending',
            status=Partner.Status.PENDING_APPROVAL,
        )

    def _extract_results(self, data):
        # DRF pagination có thể trả object {count, results, ...}
        return data.get('results', data) if isinstance(data, dict) else data

    def test_can_filter_pending_partners_with_status_2(self):
        self.client.force_authenticate(user=self.admin)
        url = reverse('partners:list-create')

        response = self.client.get(url, {'status': '2'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = self._extract_results(response.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['id'], self.pending_partner.id)
        self.assertEqual(results[0]['status'], Partner.Status.PENDING_APPROVAL)

    def test_admin_can_approve_pending_partner(self):
        self.client.force_authenticate(user=self.admin)
        url = reverse('partners:approve', args=[self.pending_partner.id])

        response = self.client.post(url, {})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.pending_partner.refresh_from_db()
        self.assertEqual(self.pending_partner.status, Partner.Status.ACTIVE)

    def test_admin_can_reject_pending_partner(self):
        self.client.force_authenticate(user=self.admin)
        url = reverse('partners:reject', args=[self.pending_partner.id])

        response = self.client.post(url, {})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.pending_partner.refresh_from_db()
        self.assertEqual(self.pending_partner.status, Partner.Status.INACTIVE)
