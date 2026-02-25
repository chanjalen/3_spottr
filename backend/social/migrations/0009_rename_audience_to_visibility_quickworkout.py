from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("social", "0008_add_video_to_post"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                DO $$ BEGIN
                  IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name='social_quickworkout' AND column_name='audience'
                  ) THEN
                    ALTER TABLE "social_quickworkout" RENAME COLUMN "audience" TO "visibility";
                  END IF;
                END $$;
            """,
            reverse_sql="""
                DO $$ BEGIN
                  IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name='social_quickworkout' AND column_name='visibility'
                  ) THEN
                    ALTER TABLE "social_quickworkout" RENAME COLUMN "visibility" TO "audience";
                  END IF;
                END $$;
            """,
        ),
    ]