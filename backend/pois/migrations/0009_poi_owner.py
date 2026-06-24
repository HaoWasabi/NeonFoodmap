from django.conf import settings
from django.db import migrations, models
from users.models import User

def add_owner_column_if_missing(apps, schema_editor):
    POI = apps.get_model('pois', 'POI')
    table_name = POI._meta.db_table

    with schema_editor.connection.cursor() as cursor:
        columns = {
            row[0]
            for row in schema_editor.connection.introspection.get_table_description(cursor, table_name)
        }

    if 'owner_id' in columns:
        return

    field = models.OneToOneField(
        to=User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='partner_poi',
        verbose_name='Partner sở hữu',
        help_text='Mỗi tài khoản Partner chỉ được sở hữu tối đa 1 POI.',
    )
    field.set_attributes_from_name('owner')
    schema_editor.add_field(POI, field)


class Migration(migrations.Migration):

    dependencies = [
        ('pois', '0008_add_media_tts_content'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(add_owner_column_if_missing, migrations.RunPython.noop),
            ],
            state_operations=[
                migrations.AddField(
                    model_name='poi',
                    name='owner',
                    field=models.OneToOneField(
                        blank=True,
                        help_text='Mỗi tài khoản Partner chỉ được sở hữu tối đa 1 POI.',
                        null=True,
                        on_delete=models.SET_NULL,
                        related_name='partner_poi',
                        to=settings.AUTH_USER_MODEL,
                        verbose_name='Partner sở hữu',
                    ),
                ),
            ],
        ),
    ]
