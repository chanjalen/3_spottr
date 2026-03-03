# Generated migration — adds like_checkin, like_comment, mention notification types

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("notifications", "0002_remove_group_invite_type"),
    ]

    operations = [
        migrations.AlterField(
            model_name="notification",
            name="type",
            field=models.CharField(
                choices=[
                    ("like_post", "Like Post"),
                    ("like_checkin", "Like Checkin"),
                    ("like_comment", "Like Comment"),
                    ("comment", "Comment"),
                    ("follow", "Follow"),
                    ("pr", "Personal Record"),
                    ("mention", "Mention"),
                    ("workout_invite", "Workout Invite"),
                    ("join_request", "Join Request"),
                ],
                max_length=20,
            ),
        ),
    ]
