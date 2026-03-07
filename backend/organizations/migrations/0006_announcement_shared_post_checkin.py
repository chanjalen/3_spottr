from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('organizations', '0005_remove_orgchallenge_announcement_and_more'),
        ('social', '0015_quickworkout_is_front_camera'),
    ]

    operations = [
        migrations.AddField(
            model_name='announcement',
            name='shared_post',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='org_announcement_shares',
                to='social.post',
            ),
        ),
        migrations.AddField(
            model_name='announcement',
            name='shared_checkin',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='org_announcement_shares',
                to='social.quickworkout',
            ),
        ),
    ]
