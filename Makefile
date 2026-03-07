COMPOSE      = docker compose -f compose.yml
COMPOSE_PROD = docker compose -f compose.prod.yml
BACKEND      = $(COMPOSE) exec backend

# ── Dev ───────────────────────────────────────────────────────────────────────

up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f backend

migrate:
	$(BACKEND) python manage.py migrate

makemigrations:
	$(BACKEND) python manage.py makemigrations

shell:
	$(BACKEND) python manage.py shell

# ── Prod ─────────────────────────────────────────────────────────────────────

prod-up:
	$(COMPOSE_PROD) up -d --build

prod-down:
	$(COMPOSE_PROD) down

prod-logs:
	$(COMPOSE_PROD) logs -f backend

prod-migrate:
	$(COMPOSE_PROD) exec backend python manage.py migrate

prod-makemigrations:
	$(COMPOSE_PROD) exec backend python manage.py makemigrations

.PHONY: up down logs migrate makemigrations shell prod-up prod-down prod-logs prod-migrate prod-makemigrations
