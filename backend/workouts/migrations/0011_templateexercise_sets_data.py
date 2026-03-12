from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('workouts', '0010_alter_exercisecatalog_category'),
    ]

    operations = [
        migrations.AddField(
            model_name='templateexercise',
            name='sets_data',
            field=models.JSONField(blank=True, default=list),
        ),
    ]
