# Spottr

A fitness social networking application that helps users find gyms, track workouts, and connect with their fitness community.

## Team Information

- **Team Number:** 3
- **Project Name:** Spottr

## Features

- Find nearby gyms with activity levels and stats
- Track workouts and personal records
- Connect with friends and fitness groups
- Share workout achievements

## Tech Stack

- **Backend:** Django 6.0 (Python)
- **Frontend:** React Native (Mobile App)
- **Database:** SQLite (dev) / PostgreSQL (prod)

## Getting Started

### Prerequisites

- Python 3.12+
- pip
- virtualenv (recommended)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/spottr.git
   cd spottr
   ```

2. Create and activate a virtual environment:
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

4. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

5. Run migrations:
   ```bash
   python manage.py migrate
   ```

6. Start the development server:
   ```bash
   python manage.py runserver
   ```

7. Visit http://127.0.0.1:8000/ in your browser

### Running in Different Environments

**Development (default):**
```bash
python manage.py runserver
# Uses config.settings.dev (DEBUG=True)
```

**Production:**
```bash
export DJANGO_SETTINGS_MODULE=config.settings.prod
python manage.py runserver
# Uses config.settings.prod (DEBUG=False)
```

## Project Structure

```
Spottr/
├── backend/
│   ├── config/
│   │   ├── settings/
│   │   │   ├── base.py      # Common settings
│   │   │   ├── dev.py       # Development settings
│   │   │   └── prod.py      # Production settings
│   │   ├── urls.py
│   │   └── wsgi.py
│   ├── gyms/                 # Gyms app
│   ├── accounts/             # User accounts app
│   ├── workouts/             # Workouts tracking app
│   ├── social/               # Social features app
│   └── ...
├── docs/
│   ├── wireframes/           # UI/UX wireframes
│   ├── branching_strategy/   # Git branching docs
│   └── notes/                # Weekly notes and updates
└── README.md
```

## Views Demo

This project demonstrates different Django view patterns:

| View | Type | URL |
|------|------|-----|
| View 1 | HttpResponse (Manual) | `/gyms/manual/` |
| View 2 | render() Shortcut | `/gyms/render/` |
| View 3 | Base CBV | `/gyms/cbv/` |
| View 4 | Generic ListView | `/gyms/generic/` |

## Contributing

1. Create a feature branch from `dev`
2. Make your changes
3. Submit a pull request to `dev`
4. After review, merge to `main`

## License

This project is for educational purposes as part of INFO 490.
