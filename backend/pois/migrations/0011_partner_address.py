from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pois', '0010_partner_user_and_nullable_poi'),
    ]

    operations = [
        migrations.AddField(
            model_name='partner',
            name='address',
            field=models.TextField(
                blank=True,
                default='',
                help_text='Địa chỉ cơ sở đối tác.',
                verbose_name='Địa chỉ',
            ),
        ),
    ]
