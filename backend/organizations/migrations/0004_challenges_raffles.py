import common.models
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('organizations', '0003_add_last_announcements_read_at'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # Add kind field to Announcement
        migrations.AddField(
            model_name='announcement',
            name='kind',
            field=models.CharField(
                choices=[
                    ('announcement', 'Announcement'),
                    ('challenge', 'Challenge'),
                    ('raffle', 'Raffle'),
                ],
                default='announcement',
                max_length=20,
            ),
        ),

        # OrgChallenge
        migrations.CreateModel(
            name='OrgChallenge',
            fields=[
                ('id', models.CharField(default=common.models.generate_uuid, max_length=36, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('workout_type', models.CharField(max_length=100)),
                ('target_description', models.CharField(blank=True, max_length=200)),
                ('due_date', models.DateField()),
                ('announcement', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='challenge',
                    to='organizations.announcement',
                )),
            ],
            options={
                'abstract': False,
            },
        ),

        # OrgChallengeCompletion
        migrations.CreateModel(
            name='OrgChallengeCompletion',
            fields=[
                ('id', models.CharField(default=common.models.generate_uuid, max_length=36, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('note', models.TextField(blank=True)),
                ('photo', models.ImageField(blank=True, null=True, upload_to='challenge_completions/')),
                ('challenge', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='completions',
                    to='organizations.orgchallenge',
                )),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='challenge_completions',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.AddConstraint(
            model_name='orgchallengecompletion',
            constraint=models.UniqueConstraint(
                fields=['challenge', 'user'],
                name='unique_challenge_completion',
            ),
        ),

        # OrgRaffle
        migrations.CreateModel(
            name='OrgRaffle',
            fields=[
                ('id', models.CharField(default=common.models.generate_uuid, max_length=36, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('description', models.TextField(blank=True)),
                ('ends_at', models.DateTimeField()),
                ('status', models.CharField(
                    choices=[('open', 'Open'), ('drawn', 'Drawn')],
                    default='open',
                    max_length=20,
                )),
                ('announcement', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='raffle',
                    to='organizations.announcement',
                )),
                ('winner', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='won_raffles',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'abstract': False,
            },
        ),

        # OrgRaffleEntry
        migrations.CreateModel(
            name='OrgRaffleEntry',
            fields=[
                ('id', models.CharField(default=common.models.generate_uuid, max_length=36, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('date', models.DateField()),
                ('raffle', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='entries',
                    to='organizations.orgraffle',
                )),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='raffle_entries',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.AddConstraint(
            model_name='orgraffleentry',
            constraint=models.UniqueConstraint(
                fields=['raffle', 'user', 'date'],
                name='unique_raffle_entry_per_day',
            ),
        ),
    ]
