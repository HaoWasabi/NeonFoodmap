from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('payments', '0003_tourpurchase'),
    ]

    operations = [
        migrations.CreateModel(
            name='PartnerPremiumPurchase',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('purchased_at', models.DateTimeField(auto_now_add=True, verbose_name='Ngày mua')),
                ('invoice', models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='partner_premium_purchase', to='payments.invoice')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='partner_premium_purchases', to='users.user')),
            ],
            options={
                'db_table': 'partner_premium_purchases',
                'verbose_name': 'Mua Premium Partner',
                'verbose_name_plural': 'Mua Premium Partner',
                'ordering': ['-purchased_at'],
            },
        ),
        migrations.AddConstraint(
            model_name='partnerpremiumpurchase',
            constraint=models.UniqueConstraint(fields=('user',), name='uniq_user_partner_premium_purchase'),
        ),
    ]