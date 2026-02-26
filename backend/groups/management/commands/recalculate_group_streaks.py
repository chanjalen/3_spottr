from django.core.management.base import BaseCommand

from groups.services import reset_stale_group_streaks


class Command(BaseCommand):
    help = (
        'Safety-net: reset group streaks for groups that missed yesterday. '
        'Run daily after 3 AM. Streak advancement now happens live when users log activity.'
    )

    def handle(self, *args, **options):
        reset_count = reset_stale_group_streaks()
        self.stdout.write(f'Reset {reset_count} stale group streak(s).')
        self.stdout.write(self.style.SUCCESS('Done.'))
