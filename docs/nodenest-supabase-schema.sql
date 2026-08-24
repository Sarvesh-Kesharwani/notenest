create table if not exists public.nodenest_projects (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  project_key text not null,
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_key, project_key)
);

create table if not exists public.nodenest_revision_configs (
  project_id uuid primary key references public.nodenest_projects(id) on delete cascade,
  -- Stores revision videos plus app sections such as study topics and JSON usage.
  config jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.nodenest_projects enable row level security;
alter table public.nodenest_revision_configs enable row level security;

revoke all on table public.nodenest_projects from anon, authenticated;
revoke all on table public.nodenest_revision_configs from anon, authenticated;

grant select, insert, update, delete on table public.nodenest_projects to service_role;
grant select, insert, update, delete on table public.nodenest_revision_configs to service_role;

create index if not exists nodenest_projects_owner_project_idx
  on public.nodenest_projects(owner_key, project_key);

create or replace function public.nodenest_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists nodenest_projects_touch_updated_at on public.nodenest_projects;
create trigger nodenest_projects_touch_updated_at
before update on public.nodenest_projects
for each row execute function public.nodenest_touch_updated_at();

drop trigger if exists nodenest_revision_configs_touch_updated_at on public.nodenest_revision_configs;
create trigger nodenest_revision_configs_touch_updated_at
before update on public.nodenest_revision_configs
for each row execute function public.nodenest_touch_updated_at();
