from django.db import migrations


class Migration(migrations.Migration):
    # Superseded by 0009_quickworkout_add_workout_fk_and_audience — kept as no-op
    # so existing databases that recorded this migration don't break.

    dependencies = [
        ("social", "0008_add_video_to_post"),
    ]

    operations = []