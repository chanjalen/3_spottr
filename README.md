# Spottr

A fitness social networking app — find gyms, track workouts, share check-ins, and connect with your fitness community.

## Team Information

- **Team Number:** 3
- **Project Name:** Spottr

## Tech Stack

- **Backend:** Django 6.0 (Python) + Daphne ASGI (HTTP + WebSocket)
- **Frontend:** React Native / Expo (iOS & Android)
- **Database:** PostgreSQL (Supabase)
- **Cache / Channels / Queue:** Redis + Celery
- **Media Storage:** Supabase S3
- **Proxy:** NGINX
- **Push Notifications:** Expo Push API

---

## Getting Started

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Node.js 18+](https://nodejs.org/)
- [Expo CLI](https://docs.expo.dev/get-started/installation/): `npm install -g expo-cli`
- [EAS CLI](https://docs.expo.dev/build/setup/): `npm install -g eas-cli`
- [Tailscale](https://tailscale.com/) — required so your phone can reach the dev backend over VPN
- An Expo account (free at [expo.dev](https://expo.dev))

---

## Backend Setup (Docker)

### 1. Environment variables

```bash
cp backend/.env.example backend/.env
# Fill in SECRET_KEY, DB_*, SUPABASE_S3_*, GROQ_API_KEY, GOOGLE_* values
```

### 2. Start all services

```bash
docker compose up --build
```

This starts: Django/Daphne, NGINX, Redis, Celery worker, Celery Beat.

### 3. First-run migrations

```bash
docker compose exec backend python manage.py migrate
```

The API is now available at `http://localhost` (port 80 via NGINX).

### Useful backend commands

```bash
# View logs
docker compose logs -f backend

# Open Django shell
docker compose exec backend python manage.py shell

# Send a test push notification to a user
cat > /tmp/push.py << 'EOF'
from accounts.models import User
from accounts.push import send_push_to_user
user = User.objects.get(username='yourusername')
send_push_to_user(user, title='Test', body='Push is working!', data={'type': 'gym_reminder'})
EOF
docker compose exec backend python manage.py shell < /tmp/push.py
```

---

## Frontend Setup (Expo)

### 1. Install dependencies

```bash
cd frontend
npm install
```

### 2. Environment variables

Create `frontend/.env`:

```env
EXPO_PUBLIC_APP_VARIANT=development
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_IOS_DEV_CLIENT_ID=...
```

### 3. Start the dev server

```bash
cd frontend
npx expo start --clear
```

---

## Running on Your Phone

There are two ways to run the app on a physical device. **Dev build is recommended** — it supports all native features (camera, push notifications, Google sign-in).

### Option A: Dev Build (recommended)

The dev build is a standalone `.ipa` installed separately from the TestFlight production build. It has its own bundle ID (`app.spottr.mobile.dev`) so both can coexist on the same device.

#### Build and install (one-time setup)

```bash
cd frontend

# Log in to Expo
eas login

# Build the dev client for iOS (takes ~10–15 min, uses EAS cloud)
eas build --profile development --platform ios

# When prompted "Install on connected device?" → Yes
# Or download the .ipa from expo.dev and install via AltStore / TestFlight internal
```

> **Note:** EAS free tier has a limited number of builds per month. Only rebuild when native dependencies change (e.g. adding a new Expo module). JS-only changes hot reload without a rebuild.

#### Connect to dev server

1. Make sure your Mac and phone are on the **same Tailscale network**
2. Start the Expo dev server: `npx expo start --clear`
3. Open the **Spottr (Dev)** app on your phone
4. Tap "Enter URL manually" and enter: `exp+spottr://expo-development-client/?url=http%3A%2F%2F<your-tailscale-ip>%3A8081`
   - Find your Tailscale IP in the Tailscale menu bar app
   - Or use the QR code scanner **inside** the Spottr (Dev) app (not the iOS camera app)

#### After connecting

JS changes (components, screens, logic) hot reload instantly — no rebuild needed.
Native changes (new packages with native code, permissions, etc.) require a new `eas build`.

---

### Option B: Expo Go (limited)

Expo Go works for basic UI development but **does not support**:
- Push notifications
- Google sign-in
- Camera (some features)
- Any custom native modules

```bash
npx expo start --clear
# Scan QR code with the Expo Go app
```

---

## Dev Build vs TestFlight

| | Dev Build (`app.spottr.mobile.dev`) | TestFlight (`app.spottr.mobile`) |
|---|---|---|
| **Purpose** | Active development | Production testing |
| **Google sign-in** | Dev client ID | Production client ID |
| **Push notifications** | Works | Works |
| **Hot reload** | Yes | No |
| **Backend** | Local (Tailscale IP) | `api.spottrgym.app` |
| **App name** | Spottr (Dev) | Spottr |

Both can be installed on the same device simultaneously.

---

## Project Structure

```
Spottr/
├── backend/
│   ├── config/
│   │   ├── settings/
│   │   │   ├── base.py          # Common settings
│   │   │   ├── dev.py           # Development overrides
│   │   │   └── prod.py          # Production overrides
│   │   ├── urls.py
│   │   └── asgi.py
│   ├── accounts/                # Users, auth, push tokens, Google OAuth
│   ├── social/                  # Posts, check-ins, feed, follows
│   ├── workouts/                # Workout logging, personal records
│   ├── gyms/                    # Gym discovery, busy levels
│   ├── groups/                  # Workout groups
│   ├── messaging/               # DMs and group chat (WebSocket)
│   ├── notifications/           # In-app + push notifications
│   └── organizations/           # Org announcements
├── frontend/
│   ├── App.tsx                  # Root component, navigation setup
│   ├── app.config.js            # Dynamic Expo config (dev vs prod bundle ID)
│   ├── eas.json                 # EAS build profiles
│   ├── src/
│   │   ├── api/                 # API client + endpoint functions
│   │   ├── components/          # Reusable UI components
│   │   ├── hooks/               # Custom hooks (auth, push, Google OAuth)
│   │   ├── navigation/          # Stack + tab navigators
│   │   ├── screens/             # All app screens
│   │   ├── store/               # React Context (auth, workout, unread)
│   │   ├── theme/               # Colors, spacing, typography
│   │   └── types/               # TypeScript types
└── README.md
```

---

## Key API Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /accounts/api/login/` | Login |
| `POST /accounts/api/signup/` | Signup |
| `GET /accounts/api/me/` | Current user |
| `POST /accounts/api/push-token/` | Register push token |
| `GET /api/feed/` | Main feed |
| `POST /social/api/checkin/` | Create check-in |
| `GET /accounts/api/profile/<username>/` | User profile |
| `GET /api/notifications/` | Notifications |
| `GET /api/gyms/gyms/` | Gym list/search |

---

## Contributing

1. Branch from `dev`
2. Make your changes
3. Open a PR to `dev`
4. After review, `dev` merges to `main` for production deploys
