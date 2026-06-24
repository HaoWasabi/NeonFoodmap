from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from pois.models import POI, Partner
from pois.qr_map import sign_poi_map_qr, verify_poi_map_qr

User = get_user_model()


class QrMapSigningTests(TestCase):
    def test_sign_verify_roundtrip(self):
        tid = sign_poi_map_qr(42)
        self.assertEqual(verify_poi_map_qr(tid), 42)


class MapQrApiTests(APITestCase):
    def setUp(self):
        self.poi = POI.objects.create(
            name='Venue',
            description='d',
            latitude=10.75,
            longitude=106.7,
            geofence_radius=50,
            category='food',
            qr_code_data='POI_99',
            status=POI.Status.ACTIVE,
        )
        self.user = User.objects.create_user(
            email='partner@test.com',
            username='partner@test.com',
            password='TestPass123!',
        )
        group, _ = Group.objects.get_or_create(name='Partner')
        self.user.groups.add(group)
        Partner.objects.create(
            user=self.user,
            poi=self.poi,
            business_name='Cafe',
            status=Partner.Status.ACTIVE,
        )

    def test_partner_gets_qr_map_url(self):
        self.client.force_authenticate(user=self.user)
        url = reverse('pois:my-poi-qr-map-url')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('map_path', response.data)
        self.assertTrue(response.data['map_path'].startswith('/map?'))
        self.assertIn(f'poi={self.poi.id}', response.data['map_path'])
        self.assertIn('qr=', response.data['map_path'])

    def test_resolve_valid_token(self):
        token = sign_poi_map_qr(self.poi.id)
        url = reverse('pois:map-qr-resolve')
        response = self.client.get(url, {'poi': str(self.poi.id), 'qr': token})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['id'], self.poi.id)

    def test_resolve_mismatch_poi_returns_400(self):
        token = sign_poi_map_qr(self.poi.id)
        url = reverse('pois:map-qr-resolve')
        response = self.client.get(url, {'poi': '999', 'qr': token})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
