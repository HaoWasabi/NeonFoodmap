"""
Optional checks: may fail in CI when secrets are not set.
Run explicitly: python manage.py test payments.tests.test_optional --settings=config.settings_test
"""
import os
import unittest

from django.conf import settings
from django.test import TestCase


@unittest.skipUnless(
    os.environ.get('PAYPAL_CLIENT_ID') and os.environ.get('PAYPAL_SECRET'),
    'Skipped: PAYPAL_CLIENT_ID and PAYPAL_SECRET not set',
)
class PayPalEnvOptionalTests(TestCase):
    def test_paypal_sandbox_credentials_present(self):
        """
        Informational: fails if PayPal sandbox vars are unset.
        """
        self.assertTrue(
            bool(settings.PAYPAL_CLIENT_ID and settings.PAYPAL_SECRET),
            'Optional: set PAYPAL_CLIENT_ID and PAYPAL_SECRET to pass this check.',
        )
