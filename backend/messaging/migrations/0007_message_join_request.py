from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('groups', '0001_initial'),
        ('messaging', '0006_message_system'),
    ]

    operations = [
        migrations.AddField(
            model_name='message',
            name='join_request',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='system_messages',
                to='groups.groupjoinrequest',
            ),
        ),
    ]
