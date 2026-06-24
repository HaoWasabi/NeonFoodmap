from rest_framework.test import APITestCase


class CoreAPICriticalTests(APITestCase):
    def test_health_returns_ok(self):
        r = self.client.get('/api/health/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['status'], 'ok')

    def test_api_root_has_app_metadata(self):
        r = self.client.get('/api/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['app'], 'BuocChanSoiDa')
        self.assertIn('endpoints', r.data)
