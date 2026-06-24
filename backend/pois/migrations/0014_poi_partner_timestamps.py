# Generated manually — thêm audit thời gian cho POI và Partner

import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pois', '0013_poi_uniq_poi_active_lat_lng'),
    ]

    operations = [
        migrations.AddField(
            model_name='poi',
            name='created_at',
            field=models.DateTimeField(
                auto_now_add=True,
                default=django.utils.timezone.now,
                verbose_name='Ngày tạo',
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='poi',
            name='updated_at',
            field=models.DateTimeField(
                auto_now=True,
                default=django.utils.timezone.now,
                verbose_name='Cập nhật lần cuối',
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='partner',
            name='created_at',
            field=models.DateTimeField(
                auto_now_add=True,
                default=django.utils.timezone.now,
                verbose_name='Ngày tạo hồ sơ',
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='partner',
            name='updated_at',
            field=models.DateTimeField(
                auto_now=True,
                default=django.utils.timezone.now,
                verbose_name='Cập nhật hồ sơ',
            ),
            preserve_default=False,
        ),
    ]
