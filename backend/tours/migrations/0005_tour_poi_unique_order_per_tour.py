from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tours", "0004_tour_description_estimated_duration_min"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="tour_poi",
            constraint=models.UniqueConstraint(
                fields=("tour", "sequence_order"),
                name="uniq_tour_sequence_order",
            ),
        ),
    ]

