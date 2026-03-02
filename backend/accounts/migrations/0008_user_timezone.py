from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0007_google_auth'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='timezone',
            field=models.CharField(default='UTC', max_length=50),
        ),
    ]
