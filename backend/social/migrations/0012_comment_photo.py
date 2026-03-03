from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('social', '0011_merge_migrations'),
    ]

    operations = [
        migrations.AddField(
            model_name='comment',
            name='photo',
            field=models.ImageField(blank=True, null=True, upload_to='comment_photos/'),
        ),
    ]
