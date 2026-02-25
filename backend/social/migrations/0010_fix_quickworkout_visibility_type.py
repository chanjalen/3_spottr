from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("social", "0009_rename_audience_to_visibility_quickworkout"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                DO $$ BEGIN
                  IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name='social_quickworkout'
                      AND column_name='visibility'
                      AND data_type='jsonb'
                  ) THEN
                    ALTER TABLE "social_quickworkout" DROP COLUMN "visibility";
                    ALTER TABLE "social_quickworkout"
                      ADD COLUMN "visibility" varchar(10) NOT NULL DEFAULT 'main';
                  END IF;
                END $$;
            """,
            reverse_sql="""
                DO $$ BEGIN
                  IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name='social_quickworkout'
                      AND column_name='visibility'
                      AND data_type NOT IN ('jsonb')
                  ) THEN
                    ALTER TABLE "social_quickworkout" DROP COLUMN "visibility";
                    ALTER TABLE "social_quickworkout"
                      ADD COLUMN "visibility" jsonb NOT NULL DEFAULT '[]';
                  END IF;
                END $$;
            """,
        ),
    ]
