from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from tours.models import Tour

User = get_user_model()


class TourAPICriticalTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='tester',
            email='tester@example.com',
            password='test-pass-123',
        )

    def test_tour_list_empty(self):
        r = self.client.get('/api/tours/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 0)

    def test_tour_list_returns_active_only(self):
        Tour.objects.create(
            tour_name='Active tour',
            created_by=self.user,
            status=Tour.Status.ACTIVE,
        )
        Tour.objects.create(
            tour_name='Inactive',
            created_by=self.user,
            status=Tour.Status.INACTIVE,
        )
        r = self.client.get('/api/tours/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 1)
        self.assertEqual(r.data[0]['name'], 'Active tour')
