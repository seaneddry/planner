-- Named folders for a project's links. Each entry is {"id": text, "name": text}.
-- A link joins a folder through an optional "group" field holding that folder's id;
-- links without one show under "Other links".

alter table public.planner_projects
  add column if not exists link_groups jsonb not null default '[]'::jsonb;
