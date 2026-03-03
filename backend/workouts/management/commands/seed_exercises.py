"""
Custom Spottr exercise database — curated in-house list.

Usage:
    python manage.py seed_exercises           # add new, skip existing
    python manage.py seed_exercises --clear   # wipe first, then seed
"""
from django.core.management.base import BaseCommand
from workouts.models import ExerciseCatalog


def _e(name, cat, muscle='', sets=3, reps=10, cardio=False, bw=False):
    return {
        'name': name,
        'category': cat,
        'muscle_group': muscle,
        'default_sets': sets,
        'default_reps': reps,
        'is_cardio': cardio,
        'is_bodyweight': bw,
        'default_weight': 0,
    }


EXERCISES = [

    # ── CHEST ────────────────────────────────────────────────────────────────
    _e('Bench Press',                           'chest', 'Pectorals',  4, 8),
    _e('Bench Press (Barbell)',                  'chest', 'Pectorals',  4, 8),
    _e('Bench Press — Close Grip (Barbell)',     'chest', 'Pectorals',  3, 10),
    _e('Bench Press — Wide Grip (Barbell)',      'chest', 'Pectorals',  4, 8),
    _e('Bench Press (Dumbbell)',                 'chest', 'Pectorals',  4, 8),
    _e('Bench Press — Neutral Grip (Dumbbell)',  'chest', 'Pectorals',  3, 10),
    _e('Bench Press (Smith Machine)',            'chest', 'Pectorals',  4, 8),
    _e('Incline Press',                          'chest', 'Pectorals',  4, 8),
    _e('Incline Press (Barbell)',                'chest', 'Pectorals',  4, 8),
    _e('Incline Press — Close Grip (Barbell)',   'chest', 'Pectorals',  3, 10),
    _e('Incline Press (Dumbbell)',               'chest', 'Pectorals',  3, 10),
    _e('Incline Press (Smith Machine)',          'chest', 'Pectorals',  3, 10),
    _e('Decline Press',                          'chest', 'Pectorals',  3, 10),
    _e('Decline Press (Barbell)',                'chest', 'Pectorals',  3, 10),
    _e('Decline Press (Dumbbell)',               'chest', 'Pectorals',  3, 10),
    _e('Chest Fly',                              'chest', 'Pectorals',  3, 12),
    _e('Chest Fly (Dumbbell)',                   'chest', 'Pectorals',  3, 12),
    _e('Chest Fly (Machine)',                    'chest', 'Pectorals',  3, 12),
    _e('Chest Fly — High to Low (Cable)',        'chest', 'Pectorals',  3, 12),
    _e('Chest Fly — Low to High (Cable)',        'chest', 'Pectorals',  3, 12),
    _e('Chest Press',                            'chest', 'Pectorals',  3, 10),
    _e('Chest Press (Machine)',                  'chest', 'Pectorals',  3, 10),
    _e('Chest Press (Plate Loaded)',             'chest', 'Pectorals',  3, 10),
    _e('Push-Up',                                'chest', 'Pectorals',  3, 15, bw=True),
    _e('Push-Up — Close Grip',                  'chest', 'Pectorals',  3, 12, bw=True),
    _e('Push-Up — Wide Grip',                   'chest', 'Pectorals',  3, 12, bw=True),
    _e('Push-Up — Weighted',                    'chest', 'Pectorals',  3, 12),
    _e('Push-Up — Incline',                     'chest', 'Pectorals',  3, 12, bw=True),
    _e('Push-Up — Decline',                     'chest', 'Pectorals',  3, 12, bw=True),
    _e('Dips',                                   'chest', 'Pectorals',  3, 10, bw=True),
    _e('Dips — Weighted',                        'chest', 'Pectorals',  3, 10),
    _e('Dips — Assisted',                        'chest', 'Pectorals',  3, 10),

    # ── BACK ─────────────────────────────────────────────────────────────────
    _e('Pull-Up',                                'back', 'Latissimus Dorsi', 3, 8, bw=True),
    _e('Pull-Up — Wide Grip',                   'back', 'Latissimus Dorsi', 3, 8, bw=True),
    _e('Pull-Up — Close Grip',                  'back', 'Latissimus Dorsi', 3, 8, bw=True),
    _e('Pull-Up — Weighted',                    'back', 'Latissimus Dorsi', 3, 8),
    _e('Pull-Up — Assisted',                    'back', 'Latissimus Dorsi', 3, 10),
    _e('Chin-Up',                                'back', 'Latissimus Dorsi', 3, 8, bw=True),
    _e('Chin-Up — Close Grip',                  'back', 'Latissimus Dorsi', 3, 8, bw=True),
    _e('Chin-Up — Weighted',                    'back', 'Latissimus Dorsi', 3, 8),
    _e('Chin-Up — Assisted',                    'back', 'Latissimus Dorsi', 3, 10),
    _e('Lat Pulldown (Cable)',                   'back', 'Latissimus Dorsi', 3, 10),
    _e('Lat Pulldown — Wide Grip (Cable)',       'back', 'Latissimus Dorsi', 3, 10),
    _e('Lat Pulldown — Close Grip (Cable)',      'back', 'Latissimus Dorsi', 3, 10),
    _e('Lat Pulldown — Neutral Grip (Cable)',    'back', 'Latissimus Dorsi', 3, 10),
    _e('Barbell Row',                            'back', 'Rhomboids, Lats',  4, 8),
    _e('Barbell Row — Underhand Grip',           'back', 'Rhomboids, Lats',  4, 8),
    _e('Dumbbell Row',                           'back', 'Rhomboids, Lats',  3, 10),
    _e('Dumbbell Row — Chest Supported',         'back', 'Rhomboids, Lats',  3, 10),
    _e('Seated Row (Cable)',                     'back', 'Rhomboids, Lats',  3, 10),
    _e('Seated Row — Wide Grip (Cable)',         'back', 'Rhomboids, Lats',  3, 10),
    _e('Seated Row — Close Grip (Cable)',        'back', 'Rhomboids, Lats',  3, 10),
    _e('T-Bar Row (Barbell)',                    'back', 'Rhomboids, Lats',  4, 8),
    _e('T-Bar Row (Machine)',                    'back', 'Rhomboids, Lats',  3, 10),
    _e('Deadlift',                               'back', 'Lower Back',       4, 5),
    _e('Deadlift — Sumo',                        'back', 'Lower Back',       4, 5),
    _e('Deadlift — Trap Bar',                    'back', 'Lower Back',       4, 5),
    _e('Inverted Row',                           'back', 'Rhomboids, Lats',  3, 10, bw=True),
    _e('Face Pull (Cable)',                      'back', 'Rear Deltoids',    3, 15),
    _e('Dead Hang',                              'back', 'Latissimus Dorsi', 3, 1, bw=True),
    _e('Farmer\'s Carry (Dumbbell)',             'back', 'Trapezius',        3, 1),
    _e('Farmer\'s Carry (Trap Bar)',             'back', 'Trapezius',        3, 1),

    # ── SHOULDERS ────────────────────────────────────────────────────────────
    _e('Overhead Press',                         'shoulders', 'Deltoids', 4, 8),
    _e('Overhead Press (Barbell)',                'shoulders', 'Deltoids', 4, 8),
    _e('Overhead Press (Dumbbell)',               'shoulders', 'Deltoids', 3, 10),
    _e('Overhead Press — Neutral Grip (Dumbbell)','shoulders', 'Deltoids', 3, 10),
    _e('Overhead Press (Smith Machine)',          'shoulders', 'Deltoids', 3, 10),
    _e('Arnold Press',                            'shoulders', 'Deltoids', 3, 10),
    _e('Lateral Raise',                           'shoulders', 'Lateral Deltoids', 3, 12),
    _e('Lateral Raise (Dumbbell)',                'shoulders', 'Lateral Deltoids', 3, 12),
    _e('Lateral Raise (Cable)',                   'shoulders', 'Lateral Deltoids', 3, 12),
    _e('Lateral Raise (Machine)',                 'shoulders', 'Lateral Deltoids', 3, 12),
    _e('Lateral Raise — Leaning (Dumbbell)',      'shoulders', 'Lateral Deltoids', 3, 12),
    _e('Front Raise',                             'shoulders', 'Front Deltoids', 3, 12),
    _e('Front Raise (Dumbbell)',                  'shoulders', 'Front Deltoids', 3, 12),
    _e('Front Raise (Barbell)',                   'shoulders', 'Front Deltoids', 3, 12),
    _e('Front Raise (Cable)',                     'shoulders', 'Front Deltoids', 3, 12),
    _e('Rear Delt Fly',                           'shoulders', 'Rear Deltoids', 3, 12),
    _e('Rear Delt Fly (Dumbbell)',                'shoulders', 'Rear Deltoids', 3, 12),
    _e('Rear Delt Fly (Machine)',                 'shoulders', 'Rear Deltoids', 3, 12),
    _e('Rear Delt Fly (Cable)',                   'shoulders', 'Rear Deltoids', 3, 12),
    _e('Shrugs',                                  'shoulders', 'Trapezius', 3, 12),
    _e('Shrugs (Barbell)',                         'shoulders', 'Trapezius', 3, 12),
    _e('Shrugs (Dumbbell)',                        'shoulders', 'Trapezius', 3, 12),
    _e('Shrugs (Smith Machine)',                   'shoulders', 'Trapezius', 3, 12),

    # ── BICEPS ───────────────────────────────────────────────────────────────
    _e('Barbell Curl',                            'biceps', 'Biceps', 3, 10),
    _e('Barbell Curl — Wide Grip',                'biceps', 'Biceps', 3, 10),
    _e('Barbell Curl — Close Grip',               'biceps', 'Biceps', 3, 10),
    _e('Dumbbell Curl',                            'biceps', 'Biceps', 3, 10),
    _e('Dumbbell Curl — Alternating',              'biceps', 'Biceps', 3, 10),
    _e('EZ Bar Curl',                              'biceps', 'Biceps', 3, 10),
    _e('Hammer Curl',                              'biceps', 'Biceps, Brachialis', 3, 10),
    _e('Hammer Curl (Dumbbell)',                   'biceps', 'Biceps, Brachialis', 3, 10),
    _e('Hammer Curl (Cable)',                      'biceps', 'Biceps, Brachialis', 3, 10),
    _e('Preacher Curl',                            'biceps', 'Biceps', 3, 10),
    _e('Preacher Curl (Barbell)',                  'biceps', 'Biceps', 3, 10),
    _e('Preacher Curl (Dumbbell)',                 'biceps', 'Biceps', 3, 10),
    _e('Preacher Curl (Machine)',                  'biceps', 'Biceps', 3, 10),
    _e('Cable Curl',                               'biceps', 'Biceps', 3, 12),
    _e('Cable Curl — EZ Attachment',               'biceps', 'Biceps', 3, 12),
    _e('Cable Curl — Rope',                        'biceps', 'Biceps', 3, 12),
    _e('Concentration Curl',                       'biceps', 'Biceps', 3, 10),

    # ── TRICEPS ──────────────────────────────────────────────────────────────
    _e('Tricep Pushdown',                          'triceps', 'Triceps', 3, 12),
    _e('Tricep Pushdown — Rope',                   'triceps', 'Triceps', 3, 12),
    _e('Tricep Pushdown — Straight Bar',           'triceps', 'Triceps', 3, 12),
    _e('Tricep Pushdown — V-Bar',                  'triceps', 'Triceps', 3, 12),
    _e('Skull Crushers',                           'triceps', 'Triceps', 3, 10),
    _e('Skull Crushers (Barbell)',                  'triceps', 'Triceps', 3, 10),
    _e('Skull Crushers (EZ Bar)',                   'triceps', 'Triceps', 3, 10),
    _e('Skull Crushers (Dumbbell)',                 'triceps', 'Triceps', 3, 10),
    _e('Overhead Tricep Extension',                'triceps', 'Triceps', 3, 10),
    _e('Overhead Tricep Extension (Dumbbell)',      'triceps', 'Triceps', 3, 10),
    _e('Overhead Tricep Extension (Cable)',         'triceps', 'Triceps', 3, 12),
    _e('Overhead Tricep Extension (EZ Bar)',        'triceps', 'Triceps', 3, 10),
    _e('Close-Grip Bench Press',                   'triceps', 'Triceps', 3, 10),
    _e('Close-Grip Bench Press (Barbell)',          'triceps', 'Triceps', 3, 10),
    _e('Close-Grip Bench Press (Smith Machine)',    'triceps', 'Triceps', 3, 10),
    _e('Tricep Dips',                              'triceps', 'Triceps', 3, 10, bw=True),
    _e('Tricep Dips (Machine)',                    'triceps', 'Triceps', 3, 10),

    # ── LEGS ─────────────────────────────────────────────────────────────────
    _e('Squat',                                    'legs', 'Quadriceps, Glutes', 4, 8),
    _e('Squat (Barbell)',                           'legs', 'Quadriceps, Glutes', 4, 8),
    _e('Squat — Wide Stance (Barbell)',             'legs', 'Quadriceps, Glutes', 4, 8),
    _e('Squat — Narrow Stance (Barbell)',           'legs', 'Quadriceps, Glutes', 4, 8),
    _e('Squat — Front (Barbell)',                   'legs', 'Quadriceps, Glutes', 4, 8),
    _e('Squat (Smith Machine)',                     'legs', 'Quadriceps, Glutes', 4, 8),
    _e('Leg Press',                                'legs', 'Quadriceps, Glutes', 4, 10),
    _e('Leg Press (Machine)',                       'legs', 'Quadriceps, Glutes', 4, 10),
    _e('Leg Press — Wide Stance (Machine)',         'legs', 'Quadriceps, Glutes', 4, 10),
    _e('Leg Press — Narrow Stance (Machine)',       'legs', 'Quadriceps, Glutes', 4, 10),
    _e('Leg Press — Single Leg (Machine)',          'legs', 'Quadriceps, Glutes', 3, 10),
    _e('Hack Squat',                               'legs', 'Quadriceps, Glutes', 4, 10),
    _e('Hack Squat (Machine)',                      'legs', 'Quadriceps, Glutes', 4, 10),
    _e('Hack Squat (Barbell)',                      'legs', 'Quadriceps, Glutes', 4, 10),
    _e('Lunges',                                   'legs', 'Quadriceps, Glutes', 3, 10),
    _e('Lunges (Dumbbell)',                         'legs', 'Quadriceps, Glutes', 3, 10),
    _e('Lunges (Barbell)',                          'legs', 'Quadriceps, Glutes', 3, 10),
    _e('Lunges — Reverse',                          'legs', 'Quadriceps, Glutes', 3, 10, bw=True),
    _e('Bulgarian Split Squat',                    'legs', 'Quadriceps, Glutes', 3, 10),
    _e('Bulgarian Split Squat (Dumbbell)',          'legs', 'Quadriceps, Glutes', 3, 10),
    _e('Bulgarian Split Squat (Barbell)',           'legs', 'Quadriceps, Glutes', 3, 10),
    _e('Romanian Deadlift',                        'legs', 'Hamstrings, Glutes', 3, 10),
    _e('Romanian Deadlift (Barbell)',               'legs', 'Hamstrings, Glutes', 3, 10),
    _e('Romanian Deadlift (Dumbbell)',              'legs', 'Hamstrings, Glutes', 3, 10),
    _e('Leg Curl',                                 'legs', 'Hamstrings', 3, 12),
    _e('Leg Curl (Machine)',                        'legs', 'Hamstrings', 3, 12),
    _e('Leg Curl — Seated',                         'legs', 'Hamstrings', 3, 12),
    _e('Leg Curl — Single Leg',                     'legs', 'Hamstrings', 3, 12),
    _e('Leg Extension',                            'legs', 'Quadriceps', 3, 12),
    _e('Leg Extension (Machine)',                   'legs', 'Quadriceps', 3, 12),
    _e('Leg Extension — Single Leg',                'legs', 'Quadriceps', 3, 12),
    _e('Calf Raise',                               'legs', 'Calves', 4, 15, bw=True),
    _e('Calf Raise — Seated',                       'legs', 'Calves', 4, 15),
    _e('Calf Raise (Smith Machine)',                'legs', 'Calves', 4, 15),
    _e('Calf Raise — Toes In',                      'legs', 'Calves', 3, 15, bw=True),
    _e('Calf Raise — Toes Out',                     'legs', 'Calves', 3, 15, bw=True),
    _e('Hip Thrust',                               'legs', 'Glutes', 3, 10),
    _e('Hip Thrust (Barbell)',                      'legs', 'Glutes', 4, 10),
    _e('Hip Thrust (Dumbbell)',                     'legs', 'Glutes', 3, 10),
    _e('Hip Thrust (Smith Machine)',                'legs', 'Glutes', 3, 10),

    # ── CORE ─────────────────────────────────────────────────────────────────
    _e('Crunch',                                   'core', 'Abdominals', 3, 20, bw=True),
    _e('Crunch (Cable)',                            'core', 'Abdominals', 3, 15),
    _e('Crunch (Machine)',                          'core', 'Abdominals', 3, 15),
    _e('Sit-Up',                                   'core', 'Abdominals', 3, 20, bw=True),
    _e('Sit-Up — Weighted',                         'core', 'Abdominals', 3, 15),
    _e('Plank',                                    'core', 'Abdominals', 3, 1, bw=True),
    _e('Plank — Weighted',                          'core', 'Abdominals', 3, 1),
    _e('Plank — Side',                              'core', 'Obliques', 3, 1, bw=True),
    _e('Leg Raise',                                'core', 'Abdominals', 3, 15, bw=True),
    _e('Leg Raise — Hanging',                       'core', 'Abdominals', 3, 12, bw=True),
    _e('Leg Raise — Captain\'s Chair',              'core', 'Abdominals', 3, 12, bw=True),
    _e('Russian Twist',                            'core', 'Obliques', 3, 20, bw=True),
    _e('Russian Twist — Weighted',                  'core', 'Obliques', 3, 20),
    _e('Cable Woodchopper',                        'core', 'Obliques', 3, 12),
    _e('Cable Woodchopper — Low to High',           'core', 'Obliques', 3, 12),
    _e('Ab Rollout (Barbell)',                      'core', 'Abdominals', 3, 10),
    _e('Ab Rollout (Ab Wheel)',                     'core', 'Abdominals', 3, 10),

    # ── CARDIO ───────────────────────────────────────────────────────────────
    _e('Treadmill',                                'cardio', '', 1, 0, cardio=True),
    _e('Treadmill — Walk',                          'cardio', '', 1, 0, cardio=True),
    _e('Treadmill — Incline Walk',                  'cardio', '', 1, 0, cardio=True),
    _e('Stair Climber',                            'cardio', '', 1, 0, cardio=True),
    _e('Cycling (Stationary Bike)',                'cardio', '', 1, 0, cardio=True),
    _e('Cycling (Outdoor)',                        'cardio', '', 1, 0, cardio=True),
    _e('Rowing',                                   'cardio', '', 1, 0, cardio=True),
    _e('Elliptical',                               'cardio', '', 1, 0, cardio=True),
    _e('Jump Rope',                                'cardio', '', 1, 0, cardio=True, bw=True),
    _e('Sled Push',                                'cardio', '', 1, 0, cardio=True),
    _e('Burpee',                                   'cardio', '', 3, 10, cardio=True, bw=True),
    _e('Burpee — Push-Up',                          'cardio', '', 3, 10, cardio=True, bw=True),
    _e('Kettlebell Swing',                         'cardio', '', 3, 15, cardio=True),
]


class Command(BaseCommand):
    help = 'Seed ExerciseCatalog with Spottr\'s curated exercise list'

    def add_arguments(self, parser):
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Delete all existing ExerciseCatalog rows before seeding.',
        )

    def handle(self, *args, **options):
        if options['clear']:
            deleted, _ = ExerciseCatalog.objects.all().delete()
            self.stdout.write(self.style.WARNING(f'Cleared {deleted} existing exercises.'))

        created = skipped = 0
        for data in EXERCISES:
            _, was_created = ExerciseCatalog.objects.get_or_create(
                name=data['name'],
                defaults=data,
            )
            if was_created:
                created += 1
            else:
                skipped += 1

        self.stdout.write(self.style.SUCCESS(
            f'Done — {created} created, {skipped} already existed.'
        ))

        self.stdout.write('\nBreakdown by category:')
        from django.db.models import Count
        for row in (ExerciseCatalog.objects
                    .values('category')
                    .annotate(n=Count('id'))
                    .order_by('-n')):
            self.stdout.write(f'  {row["category"]:12} {row["n"]}')
        self.stdout.write(f'  {"TOTAL":12} {ExerciseCatalog.objects.count()}')
