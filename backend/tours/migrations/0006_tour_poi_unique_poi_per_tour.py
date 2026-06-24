from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tours", "0005_tour_poi_unique_order_per_tour"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="tour_poi",
            constraint=models.UniqueConstraint(
                fields=("tour", "poi"),
                name="uniq_tour_poi",
            ),
        ),
    ]

