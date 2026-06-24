from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pois', '0009_poi_owner'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='partner',
            name='user',
            field=models.OneToOneField(
                blank=True,
                help_text='Tài khoản sở hữu hồ sơ đối tác.',
                null=True,
                on_delete=models.CASCADE,
                related_name='partner_profile',
                to=settings.AUTH_USER_MODEL,
                verbose_name='Tài khoản Partner',
            ),
        ),
        migrations.AlterField(
            model_name='partner',
            name='poi',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.SET_NULL,
                related_name='partners',
                to='pois.poi',
                verbose_name='Điểm tham quan',
            ),
        ),
    ]
