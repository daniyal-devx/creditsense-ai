PYTHON ?= python

.PHONY: test demo frontend-build ci seed seed-reset seed-demo up

test:
	$(PYTHON) -m pytest

demo:
	$(PYTHON) scripts/verify_demo.py

frontend-build:
	cd frontend && npm ci && npm run build

ci: test demo frontend-build

seed:
	$(PYTHON) scripts/seed_db.py

seed-reset:
	$(PYTHON) scripts/seed_db.py --reset

seed-demo:
	$(PYTHON) scripts/seed_db.py --reset --demo-auth

up:
	docker compose up --build
