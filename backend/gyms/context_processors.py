from .models import Gym


def gyms_context(request):
    """
    Context processor to make gyms available in all templates.
    """
    return {
        'all_gyms': Gym.objects.all()
    }
