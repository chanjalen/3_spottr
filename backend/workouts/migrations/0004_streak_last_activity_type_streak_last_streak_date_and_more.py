# Custom migration to reconcile DB state with models.
# DB already has: workouts_streak.last_activity_date, workouts_streak.streak_started_at
# DB already has: workouts_restday table with 'date' column
# Models now expect: workouts_streak.last_streak_date, workouts_streak.last_activity_type
# Models now expect: workouts_restday.streak_date

import common.models
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def forwards(apps, schema_editor):
    """Rename existing columns to match new model fields."""
    connection = schema_editor.connection
    cursor = connection.cursor()

    # Check if last_activity_date exists and rename to last_activity_type
    cursor.execute(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name='workouts_streak' AND column_name='last_activity_date'"
    )
    if cursor.fetchone():
        # Drop the old column (it's a date, we need a varchar)
        cursor.execute("ALTER TABLE workouts_streak DROP COLUMN last_activity_date")

    # Check if last_activity_type doesn't exist yet
    cursor.execute(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name='workouts_streak' AND column_name='last_activity_type'"
    )
    if not cursor.fetchone():
        cursor.execute(
            "ALTER TABLE workouts_streak ADD COLUMN last_activity_type varchar(10) NOT NULL DEFAULT ''"
        )

    # Check if streak_started_at exists and drop it (not in our model)
    cursor.execute(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name='workouts_streak' AND column_name='streak_started_at'"
    )
    if cursor.fetchone():
        cursor.execute("ALTER TABLE workouts_streak DROP COLUMN streak_started_at")

    # Check if last_streak_date doesn't exist yet
    cursor.execute(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name='workouts_streak' AND column_name='last_streak_date'"
    )
    if not cursor.fetchone():
        cursor.execute(
            "ALTER TABLE workouts_streak ADD COLUMN last_streak_date date NULL"
        )

    # Only patch restday if the table already exists (legacy dev DB migration)
    cursor.execute(
        "SELECT table_name FROM information_schema.tables "
        "WHERE table_schema='public' AND table_name='workouts_restday'"
    )
    if cursor.fetchone():
        # Rename restday 'date' column to 'streak_date' if needed
        cursor.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name='workouts_restday' AND column_name='date'"
        )
        has_date = cursor.fetchone()
        cursor.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name='workouts_restday' AND column_name='streak_date'"
        )
        has_streak_date = cursor.fetchone()

        if has_date and not has_streak_date:
            cursor.execute("ALTER TABLE workouts_restday RENAME COLUMN date TO streak_date")

        # Add unique constraint on restday if not exists
        cursor.execute(
            "SELECT constraint_name FROM information_schema.table_constraints "
            "WHERE table_name='workouts_restday' AND constraint_name='unique_user_rest_day'"
        )
        if not cursor.fetchone():
            cursor.execute(
                "ALTER TABLE workouts_restday ADD CONSTRAINT unique_user_rest_day "
                "UNIQUE (user_id, streak_date)"
            )


class Migration(migrations.Migration):

    dependencies = [
        ('workouts', '0003_merge_20260210_0116'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
        # These SeparateDatabaseAndState ops tell Django the models are now in sync
        # without actually running DDL (the RunPython above handled it).
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='streak',
                    name='last_activity_type',
                    field=models.CharField(blank=True, choices=[('workout', 'Workout'), ('checkin', 'Check-in'), ('rest', 'Rest Day')], default='', max_length=10),
                ),
                migrations.AddField(
                    model_name='streak',
                    name='last_streak_date',
                    field=models.DateField(blank=True, null=True),
                ),
                migrations.CreateModel(
                    name='RestDay',
                    fields=[
                        ('id', models.CharField(default=common.models.generate_uuid, max_length=36, primary_key=True, serialize=False)),
                        ('created_at', models.DateTimeField(auto_now_add=True)),
                        ('updated_at', models.DateTimeField(auto_now=True)),
                        ('streak_date', models.DateField()),
                        ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='rest_days', to=settings.AUTH_USER_MODEL)),
                    ],
                    options={
                        'ordering': ['-streak_date'],
                        'constraints': [models.UniqueConstraint(fields=('user', 'streak_date'), name='unique_user_rest_day')],
                    },
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    """
                    CREATE TABLE IF NOT EXISTS workouts_restday (
                        id varchar(36) PRIMARY KEY,
                        created_at timestamptz NOT NULL,
                        updated_at timestamptz NOT NULL,
                        streak_date date NOT NULL,
                        user_id varchar(36) NOT NULL
                            REFERENCES accounts_user(id) ON DELETE CASCADE,
                        CONSTRAINT unique_user_rest_day UNIQUE (user_id, streak_date)
                    )
                    """,
                    reverse_sql="DROP TABLE IF EXISTS workouts_restday",
                ),
            ],
        ),
    ]
