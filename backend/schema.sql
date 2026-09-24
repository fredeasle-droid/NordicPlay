create table if not exists users (
  telegram_user_id text primary key,
  credits integer not null default 0 check (credits >= 0),
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id text primary key,
  telegram_user_id text not null references users(telegram_user_id) on delete restrict,
  product_id text not null,
  amount_dkk integer not null check (amount_dkk >= 0),
  status text not null,
  created_at timestamptz not null default now()
);
create index if not exists orders_user_idx on orders(telegram_user_id);
create index if not exists orders_status_idx on orders(status);

create table if not exists audit_log (
  id bigserial primary key,
  actor_type text not null,
  actor_id text,
  action text not null,
  entity_type text,
  entity_id text,
  created_at timestamptz not null default now()
);