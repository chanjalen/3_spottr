from django.core.management.base import BaseCommand
from social.models import Comment


class Command(BaseCommand):
    help = 'Backfill post/quick_workout on replies that were created before the fix.'

    def handle(self, *args, **options):
        # All replies where post and quick_workout are both NULL
        orphans = Comment.objects.filter(
            parent_comment__isnull=False,
            post__isnull=True,
            quick_workout__isnull=True,
        ).select_related(
            'parent_comment__post',
            'parent_comment__quick_workout',
            'parent_comment__parent_comment__post',
            'parent_comment__parent_comment__quick_workout',
        )

        total = orphans.count()
        if total == 0:
            self.stdout.write(self.style.SUCCESS('Nothing to backfill — all replies already have post set.'))
            return

        self.stdout.write(f'Found {total} orphaned repl{"y" if total == 1 else "ies"} to backfill...')

        updated = 0
        skipped = 0
        to_update = []

        for reply in orphans:
            # Walk up to the root comment
            root = reply.parent_comment
            while root.parent_comment_id:
                root = root.parent_comment

            if root.post_id:
                reply.post_id = root.post_id
                to_update.append(reply)
            elif root.quick_workout_id:
                reply.quick_workout_id = root.quick_workout_id
                to_update.append(reply)
            else:
                skipped += 1

        if to_update:
            Comment.objects.bulk_update(to_update, ['post', 'quick_workout'], batch_size=500)
            updated = len(to_update)

        self.stdout.write(self.style.SUCCESS(f'Done. Updated: {updated}  Skipped (no root): {skipped}'))
