from django.db import migrations


class Migration(migrations.Migration):
    # Merges the two parallel 0009 branches into a single leaf node.

    dependencies = [
        ('social', '0009_quickworkout_add_workout_fk_and_audience'),
        ('social', '0010_fix_quickworkout_visibility_type'),
    ]

    operations = []