from django.db import migrations


class Migration(migrations.Migration):
    """
    Drop the orphaned unique_rest_day_per_user constraint on workouts_restday.
    It is a duplicate of unique_user_rest_day (both enforce UNIQUE(user_id, streak_date)).
    unique_user_rest_day is tracked by Django's migration state (added in 0004);
    unique_rest_day_per_user was a raw SQL constraint that predated that migration.
    """

    dependencies = [
        ('workouts', '0005_copy_last_workout_to_streak_date'),
    ]

    operations = [
        migrations.RunSQL(
            sql="ALTER TABLE public.workouts_restday DROP CONSTRAINT IF EXISTS unique_rest_day_per_user;",
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
