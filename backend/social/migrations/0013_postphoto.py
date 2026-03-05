import common.models
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('social', '0012_comment_photo'),
    ]

    operations = [
        migrations.CreateModel(
            name='PostPhoto',
            fields=[
                ('id', models.CharField(default=common.models.generate_uuid, max_length=36, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('photo', models.ImageField(upload_to='posts/photos/')),
                ('order', models.PositiveIntegerField(default=0)),
                ('post', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='extra_photos',
                    to='social.post',
                )),
            ],
            options={
                'ordering': ['order'],
            },
        ),
    ]
