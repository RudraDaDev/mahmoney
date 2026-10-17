-- MahMoney schema. Run in Supabase SQL editor.
-- RLS disabled (intentional: client-side, low-stakes).

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  type text check (type in ('in','out')),
  amount numeric not null,
  category text,
  note text,
  tags text,
  tdate date default current_date,
  created_at timestamptz default now()
);

alter table transactions add column if not exists tags text;

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  target numeric not null,
  saved numeric default 0,
  interest_rate numeric default 0,
  emoji text,
  deadline date,
  created_at timestamptz default now()
);

alter table goals add column if not exists interest_rate numeric default 0;
alter table goals add column if not exists emoji text;
alter table goals add column if not exists deadline date;

create table if not exists debts (
  id uuid primary key default gen_random_uuid(),
  person text not null,
  amount numeric not null,
  direction text check (direction in ('owe','owed')),
  note text,
  settled boolean default false,
  created_at timestamptz default now()
);

create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  amount numeric,
  due_date date not null,
  recurring boolean default false,
  done boolean default false,
  created_at timestamptz default now()
);

-- disable RLS so anon key can read/write (by design)
alter table transactions disable row level security;
alter table goals disable row level security;
alter table debts disable row level security;
alter table reminders disable row level security;
