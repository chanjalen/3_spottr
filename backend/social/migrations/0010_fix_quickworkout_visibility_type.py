from django.db import migrations


class Migration(migrations.Migration):
    # Superseded by 0009_quickworkout_add_workout_fk_and_audience — kept as no-op
    # so existing databases that recorded this migration don't break.

    dependencies = [
        ("social", "0009_rename_audience_to_visibility_quickworkout"),
    ]

    operations = []