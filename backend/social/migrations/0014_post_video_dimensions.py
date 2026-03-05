from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('social', '0013_postphoto'),
    ]

    operations = [
        migrations.AddField(
            model_name='post',
            name='video_width',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='post',
            name='video_height',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
    ]
