from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tours', '0003_alter_tour_poi_sequence_order'),
    ]

    operations = [
        migrations.AddField(
            model_name='tour',
            name='description',
            field=models.TextField(blank=True, default='', verbose_name='Mô tả'),
        ),
        migrations.AddField(
            model_name='tour',
            name='estimated_duration_min',
            field=models.IntegerField(
                blank=True,
                null=True,
                verbose_name='Thời lượng ước tính (phút)',
            ),
        ),
    ]
