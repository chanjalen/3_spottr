from django.core.management.base import BaseCommand
from gyms.models import Gym


class Command(BaseCommand):
    help = 'Seeds the database with Champaign-Urbana area gyms'

    def add_arguments(self, parser):
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Clear all existing gyms before seeding',
        )

    def handle(self, *args, **options):
        if options['clear']:
            count = Gym.objects.count()
            Gym.objects.all().delete()
            self.stdout.write(f"Cleared {count} existing gyms.")

        gyms = [
            {
                'name': 'Activities and Recreation Center (ARC)',
                'address': '201 E Peabody Dr, Champaign, IL 61820',
                'latitude': 40.1020,
                'longitude': -88.2362,
            },
            {
                'name': 'Campus Recreation Center East (CRCE)',
                'address': '1102 W Gregory Dr, Urbana, IL 61801',
                'latitude': 40.1044,
                'longitude': -88.2218,
            },
            {
                'name': 'Crunch Fitness - Champaign',
                'address': '40 E Anthony Dr, Champaign, IL 61820',
                'latitude': 40.1280,
                'longitude': -88.2439,
            },
            {
                'name': 'Planet Fitness - Champaign',
                'address': '1901 N Market St, Champaign, IL 61822',
                'latitude': 40.1336,
                'longitude': -88.2445,
            },
        ]

        created_count = 0
        updated_count = 0
        for gym_data in gyms:
            _, created = Gym.objects.update_or_create(
                name=gym_data['name'],
                defaults=gym_data,
            )
            if created:
                created_count += 1
            else:
                updated_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f'Done! Created: {created_count}, Updated: {updated_count}, Total: {len(gyms)}'
            )
        )
