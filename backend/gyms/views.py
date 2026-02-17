from django.contrib.auth.decorators import login_required
from django.db.models import Count
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.template import loader
from django.views import View
from django.views.generic import ListView, DetailView

from .models import Gym, BusyLevel
from . import services


# View 1: HttpResponse (Manual)
# Using loader.get_template() and HttpResponse
def gym_list_manual(request):
    """
    Returns gym list using manual template loading with HttpResponse.
    """
    template = loader.get_template('gyms/gym_list_manual.html')
    gyms = Gym.objects.all()
    context = {'gyms': gyms}
    return HttpResponse(template.render(context, request))


# View 2: render() Shortcut
# Using the render() function with model queryset
def gym_list_render(request):
    """
    Returns gym list using render() shortcut.
    """
    gyms = Gym.objects.all()
    context = {'gyms': gyms}
    return render(request, 'gyms/gym_list_render.html', context)


# View 3: Base CBV (inherit from View)
# Manually implement get() and query the model
class GymListView(View):
    """
    Class-based view that inherits from django.views.View.
    Manually queries the model and returns a rendered template.
    """
    def get(self, request):
        gyms = Gym.objects.all()
        context = {'gyms': gyms}
        return render(request, 'gyms/gym_list_cbv.html', context)


# View 4: Generic CBV (inherit from Django generic views)
# Using ListView and DetailView
class GymGenericListView(ListView):
    """
    Generic ListView for displaying all gyms.
    Enriches each gym with busy level and enrollment data.
    Handles both GET (default list) and POST (server-side search/filter).
    """
    model = Gym
    template_name = 'gyms/gym_list_generic.html'
    context_object_name = 'gyms'

    def get_queryset(self):
        return super().get_queryset()

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        gyms = list(context['gyms'])
        enrolled_gym_ids = set()
        if self.request.user.is_authenticated:
            enrolled_gym_ids = set(self.request.user.enrolled_gyms.values_list('id', flat=True))
        for gym in gyms:
            gym_id = str(gym.id)
            busy = services.get_current_busy_level(gym_id)
            gym.busy_level = busy['level']
            gym.busy_label = busy['label'] or 'No data'
            gym.busy_responses = busy['total_responses']
            gym.enrolled_count = services.get_enrolled_users_count(gym)
            gym.is_enrolled = False
            if self.request.user.is_authenticated:
                gym.is_enrolled = gym.id in enrolled_gym_ids
            # Top total lifter
            top_lifters = services.get_top_lifters(gym_id, lift='total')
            if top_lifters:
                gym.top_lifter_name = top_lifters[0]['display_name']
                gym.top_lifter_total = top_lifters[0]['value']
                gym.top_lifter_unit = top_lifters[0]['unit']
            else:
                gym.top_lifter_name = None
                gym.top_lifter_total = None
                gym.top_lifter_unit = None
        context['gyms'] = gyms
        # Aggregations: total gym count and per-gym busy response counts
        context['total_gym_count'] = Gym.objects.count()
        context['gyms_with_data'] = BusyLevel.objects.values('gym__name').annotate(
            response_count=Count('id')
        ).order_by('-response_count')
        return context



class GymDetailView(DetailView):
    """
    Generic DetailView for displaying a single gym.
    Enriches context with busy level, invites, and leaderboard.
    """
    model = Gym
    template_name = 'gyms/gym_detail.html'
    context_object_name = 'gym'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        gym = self.object
        gym_id = str(gym.id)

        # Busy level
        busy = services.get_current_busy_level(gym_id)
        context['busy_level'] = busy['level']
        context['busy_label'] = busy['label'] or 'No data'
        context['busy_responses'] = busy['total_responses']

        # Enrollment
        context['enrolled_count'] = services.get_enrolled_users_count(gym)
        context['is_enrolled'] = False
        if self.request.user.is_authenticated:
            context['is_enrolled'] = self.request.user.enrolled_gyms.filter(id=gym.id).exists()

        # Workout invites for this gym
        context['invites'] = []
        if self.request.user.is_authenticated:
            invites = services.list_workout_invites(
                self.request.user, gym_id=gym_id
            )
            context['invites'] = invites

        return context


@login_required
def top_lifters_view(request, pk):
    """GET: top lifters at a gym for a given lift category."""
    lift = request.GET.get('lift', 'bench')
    lifters = services.get_top_lifters(str(pk), lift)
    return JsonResponse({'success': True, 'lifters': lifters})
