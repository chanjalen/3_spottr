import io

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

from django.contrib.auth.decorators import login_required
from django.db.models import Avg, Count
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
        qs = super().get_queryset()
        # Handle POST search query
        if self.request.method == 'POST':
            query = self.request.POST.get('search_query', '').strip()
            if query:
                qs = qs.filter(name__icontains=query)
                self.search_query = query
                return qs
        # Handle GET search query
        query = self.request.GET.get('q', '').strip()
        if query:
            qs = qs.filter(name__icontains=query)
        self.search_query = query
        return qs

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        gyms = list(context['gyms'])
        for gym in gyms:
            gym_id = str(gym.id)
            busy = services.get_current_busy_level(gym_id)
            gym.busy_level = busy['level']
            gym.busy_label = busy['label'] or 'No data'
            gym.busy_responses = busy['total_responses']
            gym.enrolled_count = services.get_enrolled_users_count(gym)
            gym.is_enrolled = False
            if self.request.user.is_authenticated:
                gym.is_enrolled = self.request.user.enrolled_gym_id == gym.id
        context['gyms'] = gyms
        context['search_query'] = getattr(self, 'search_query', '')
        # Aggregations: total gym count and per-gym busy response counts
        context['total_gym_count'] = Gym.objects.count()
        context['gyms_with_data'] = BusyLevel.objects.values('gym__name').annotate(
            response_count=Count('id')
        ).order_by('-response_count')
        return context

    def post(self, request, *args, **kwargs):
        """Handle POST requests for server-side search."""
        self.object_list = self.get_queryset()
        context = self.get_context_data()
        return self.render_to_response(context)


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
            context['is_enrolled'] = self.request.user.enrolled_gym_id == gym.id

        # Workout invites for this gym
        context['invites'] = []
        if self.request.user.is_authenticated:
            invites = services.list_workout_invites(
                self.request.user, gym_id=gym_id
            )
            context['invites'] = invites

        # Leaderboard
        try:
            context['leaderboard'] = services.get_gym_leaderboard(gym_id)
        except Exception:
            context['leaderboard'] = []

        return context


@login_required
def top_lifters_view(request, pk):
    """GET: top lifters at a gym for a given lift category."""
    lift = request.GET.get('lift', 'bench')
    lifters = services.get_top_lifters(str(pk), lift)
    return JsonResponse({'success': True, 'lifters': lifters})


# ---- Section 4: Matplotlib Chart Views ----

def busy_level_chart_view(request):
    """
    Generates a bar chart of average busy levels per gym using Matplotlib.
    Returns the chart as a PNG image via HttpResponse.
    Uses BytesIO to write the image to memory (avoids disk I/O).
    """
    # ORM aggregation: average busy level per gym
    data = (
        BusyLevel.objects
        .values('gym__name')
        .annotate(avg_busy=Avg('survey_response'), total=Count('id'))
        .order_by('gym__name')
    )

    gym_names = [d['gym__name'] for d in data]
    avg_levels = [float(d['avg_busy']) for d in data]

    # Color bars by busy level
    colors = []
    for level in avg_levels:
        if level <= 2:
            colors.append('#22c55e')   # green (low)
        elif level <= 3:
            colors.append('#eab308')   # yellow (moderate)
        elif level <= 4:
            colors.append('#f97316')   # orange (high)
        else:
            colors.append('#ef4444')   # red (very high)

    fig, ax = plt.subplots(figsize=(10, 5))
    fig.patch.set_facecolor('#16161f')
    ax.set_facecolor('#1e1e28')

    if gym_names:
        bars = ax.bar(gym_names, avg_levels, color=colors, edgecolor='#2a2a3a', linewidth=0.8)
        ax.set_ylim(0, 5.5)
        ax.set_yticks([1, 2, 3, 4, 5])
        ax.set_yticklabels(['Empty', 'Not Busy', 'Moderate', 'Busy', 'Packed'],
                           color='#9898a8', fontsize=10)
        plt.xticks(rotation=30, ha='right', color='#9898a8', fontsize=10)
    else:
        ax.text(0.5, 0.5, 'No busy level data available',
                ha='center', va='center', transform=ax.transAxes,
                color='#9898a8', fontsize=14)

    ax.set_title('Average Gym Busy Levels', color='#f0f0f5', fontsize=16, fontweight='bold', pad=15)
    ax.set_ylabel('Busy Level', color='#9898a8', fontsize=12)
    ax.tick_params(colors='#5a5a6e')
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['bottom'].set_color('#2a2a3a')
    ax.spines['left'].set_color('#2a2a3a')
    ax.yaxis.grid(True, color='#2a2a3a', linestyle='--', alpha=0.5)
    ax.set_axisbelow(True)

    plt.tight_layout()

    # Write chart to memory using BytesIO (efficient, no disk writes)
    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=150, bbox_inches='tight',
                facecolor=fig.get_facecolor(), edgecolor='none')
    plt.close(fig)
    buf.seek(0)

    return HttpResponse(buf.getvalue(), content_type='image/png')


def chart_page_view(request):
    """Renders the page that displays the busy level chart."""
    return render(request, 'gyms/busy_chart.html')
