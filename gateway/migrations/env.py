"""Alembic environment.

Reads the Postgres DSN from env so it works against any database — the
Supabase Postgres URL, a local docker compose instance, or RDS. The
expected env vars (any one will work):

    BASTION_DATABASE_URL=postgresql+psycopg2://user:pass@host:5432/db
    DATABASE_URL=...
    SUPABASE_DB_URL=...     (Supabase Direct Connection URL)

Run with:
    alembic upgrade head          # apply pending migrations
    alembic current               # report current schema rev
    alembic downgrade -1          # roll back one step
"""
from __future__ import annotations

import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool


config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)


def _database_url() -> str:
    for var in ("BASTION_DATABASE_URL", "DATABASE_URL", "SUPABASE_DB_URL"):
        val = os.environ.get(var, "").strip()
        if val:
            return val
    raise RuntimeError(
        "No database URL configured for migrations. Set BASTION_DATABASE_URL "
        "(or DATABASE_URL / SUPABASE_DB_URL) before running `alembic upgrade`."
    )


def run_migrations_offline() -> None:
    url = _database_url()
    context.configure(
        url=url,
        target_metadata=None,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    section = config.get_section(config.config_ini_section) or {}
    section["sqlalchemy.url"] = _database_url()
    connectable = engine_from_config(section, prefix="sqlalchemy.", poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=None)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
