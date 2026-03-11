import common.models
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('social', '0017_delete_postmedia'),
    ]

    operations = [
        migrations.CreateModel(
            name='PostMedia',
            fields=[
                ('id', models.CharField(default=common.models.generate_uuid, max_length=36, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('file', models.FileField(upload_to='posts/media/')),
                ('kind', models.CharField(choices=[('photo', 'Photo'), ('video', 'Video')], default='photo', max_length=10)),
                ('order', models.PositiveSmallIntegerField(default=0)),
                ('post', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='media_items',
                    to='social.post',
                )),
            ],
            options={
                'ordering': ['order'],
            },
        ),
    ]
