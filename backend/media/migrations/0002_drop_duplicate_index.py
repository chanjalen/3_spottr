from django.db import migrations


class Migration(migrations.Migration):
    """
    Drop the auto-generated Django FK index on media_medialink.asset_id.
    It is identical to the explicitly-named idx_media_link_asset added in
    0001_initial, so one of them is wasted overhead.
    We keep idx_media_link_asset (the intentional named index) and drop the
    auto-generated one.
    """

    dependencies = [
        ('media', '0001_initial'),
    ]

    operations = [
        migrations.RunSQL(
            sql="DROP INDEX IF EXISTS public.media_medialink_asset_id_606d2cd9;",
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
