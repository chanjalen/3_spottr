from django.core.management.base import BaseCommand

from groups.models import Group
from groups.services import recalculate_group_streak


class Command(BaseCommand):
    help = 'Recalculate group streaks for all groups. Run daily after 3 AM grace period.'

    def handle(self, *args, **options):
        groups = Group.objects.all()
        total = 0
        incremented = 0
        reset = 0
        skipped = 0

        for group in groups.iterator():
            _, action = recalculate_group_streak(group.id)
            total += 1
            if action == 'incremented':
                incremented += 1
            elif action == 'reset':
                reset += 1
            elif action == 'skipped':
                skipped += 1

        self.stdout.write(
            f'Processed {total} groups: '
            f'{incremented} incremented, {reset} reset, {skipped} skipped'
        )
        self.stdout.write(self.style.SUCCESS('Done.'))
