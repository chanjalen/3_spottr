# Generated manually for Google OAuth compatibility

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0004_remove_user_enrolled_gym_user_enrolled_gyms"),
    ]

    operations = [
        migrations.AlterField(
            model_name="user",
            name="phone_number",
            field=models.CharField(
                max_length=20, unique=True, blank=True, null=True
            ),
        ),
        migrations.AlterField(
            model_name="user",
            name="birthday",
            field=models.DateField(blank=True, null=True),
        ),
    ]
