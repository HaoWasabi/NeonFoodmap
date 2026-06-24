# Generated manually to add a sample invoice for testing VNPay flow

from django.db import migrations, transaction
import uuid


def create_sample_invoice(apps, schema_editor):
    Invoice = apps.get_model('payments', 'Invoice')
    with transaction.atomic():
        Invoice.objects.create(
            id=uuid.UUID('123e4567-e89b-12d3-a456-426614174000'),  # deterministic UUID for easy testing
            user=None,
            reason='Đặt món ăn',
            amount=59000,
            status='PENDING',
            transaction_code='',
            paid_at=None,
        )


def delete_sample_invoice(apps, schema_editor):
    Invoice = apps.get_model('payments', 'Invoice')
    with transaction.atomic():
        Invoice.objects.filter(id=uuid.UUID('123e4567-e89b-12d3-a456-426614174000')).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('payments', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(create_sample_invoice, reverse_code=delete_sample_invoice),
    ]
