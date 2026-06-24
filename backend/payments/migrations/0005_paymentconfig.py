from django.db import migrations, models


def create_default_payment_config(apps, schema_editor):
    PaymentConfig = apps.get_model('payments', 'PaymentConfig')
    PaymentConfig.objects.get_or_create(
        id=1,
        defaults={'partner_premium_price_vnd': 199000},
    )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('payments', '0004_partnerpremiumpurchase'),
    ]

    operations = [
        migrations.CreateModel(
            name='PaymentConfig',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('partner_premium_price_vnd', models.PositiveBigIntegerField(default=199000, help_text='Giá mở khóa gói premium cho tài khoản partner.', verbose_name='Giá gói Partner Premium (VND)')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Cấu hình thanh toán',
                'verbose_name_plural': 'Cấu hình thanh toán',
                'db_table': 'payment_config',
            },
        ),
        migrations.RunPython(create_default_payment_config, noop_reverse),
    ]
