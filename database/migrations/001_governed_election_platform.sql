create extension if not exists pgcrypto;

create table if not exists election_editions (
  id text primary key,
  election_type text not null check (election_type in ('pru', 'prn')),
  edition_number integer not null,
  state_id text,
  election_date date not null,
  term_id text,
  boundary_version text not null,
  publication_status text not null default 'published'
    check (publication_status in ('draft', 'reviewed', 'published', 'superseded')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (election_type, edition_number, state_id)
);

create table if not exists boundary_versions (
  id text primary key,
  effective_from date not null,
  effective_to date,
  source_url text not null,
  order_reference text,
  geometry_manifest jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists source_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_url text,
  source_sha256 text,
  published_at date,
  rights_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique nulls not distinct (source_url, source_sha256)
);

create table if not exists parties (
  id text primary key,
  name text not null,
  short_name text not null,
  logo_path text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists alliances (
  id text primary key,
  name text not null,
  short_name text not null,
  logo_path text,
  color text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists persons (
  id text primary key,
  display_name text not null,
  gender text,
  ethnicity text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists constituencies (
  id text primary key,
  code text not null,
  name text not null,
  level text not null check (level in ('parliament', 'dun', 'pdm', 'locality')),
  state_id text not null,
  parent_id text references constituencies(id),
  boundary_version text references boundary_versions(id),
  metadata jsonb not null default '{}'::jsonb,
  unique (boundary_version, level, state_id, code)
);

create table if not exists contests (
  id uuid primary key default gen_random_uuid(),
  election_id text not null references election_editions(id),
  constituency_id text not null references constituencies(id),
  registered_voters integer,
  ballots_cast integer,
  valid_votes integer,
  rejected_votes integer,
  turnout_pct numeric(8, 6),
  majority_votes integer,
  source_document_id uuid references source_documents(id),
  result_payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (election_id, constituency_id)
);

create table if not exists candidacies (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references contests(id) on delete cascade,
  person_id text references persons(id),
  ballot_name text not null,
  ballot_party_id text references parties(id),
  ballot_alliance_id text references alliances(id),
  votes integer not null check (votes >= 0),
  vote_share numeric(8, 6),
  winner boolean not null default false,
  ballot_order integer,
  metadata jsonb not null default '{}'::jsonb,
  unique (contest_id, ballot_order)
);

create table if not exists person_memberships (
  id uuid primary key default gen_random_uuid(),
  person_id text not null references persons(id),
  party_id text references parties(id),
  alliance_id text references alliances(id),
  status text not null check (status in ('party', 'independent', 'vacant', 'suspended')),
  effective_from date not null,
  effective_to date,
  source_document_id uuid references source_documents(id),
  reason text not null,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists editorial_revisions (
  id uuid primary key default gen_random_uuid(),
  election_id text references election_editions(id),
  data_kind text not null,
  status text not null default 'draft'
    check (status in ('draft', 'reviewed', 'published', 'superseded')),
  payload jsonb not null,
  reason text not null,
  source_url text,
  effective_at timestamptz,
  created_by text not null,
  reviewed_by text,
  published_by text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  published_at timestamptz,
  superseded_at timestamptz
);

create index if not exists editorial_revisions_lookup
  on editorial_revisions (election_id, data_kind, status, created_at desc);

create table if not exists editorial_revision_events (
  id bigserial primary key,
  revision_id uuid not null references editorial_revisions(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor text not null,
  note text,
  occurred_at timestamptz not null default now()
);

create table if not exists published_read_models (
  election_id text not null references election_editions(id),
  data_kind text not null,
  revision_id uuid not null references editorial_revisions(id),
  payload jsonb not null,
  etag text not null,
  published_at timestamptz not null default now(),
  primary key (election_id, data_kind)
);

create table if not exists reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  release_id text not null,
  status text not null check (status in ('passed', 'warning', 'failed')),
  summary jsonb not null,
  started_at timestamptz not null,
  completed_at timestamptz not null default now()
);

create table if not exists reconciliation_issues (
  id bigserial primary key,
  run_id uuid not null references reconciliation_runs(id) on delete cascade,
  severity text not null check (severity in ('info', 'warning', 'error')),
  election_id text,
  constituency_code text,
  rule_id text not null,
  message text not null,
  details jsonb not null default '{}'::jsonb
);

create table if not exists telemetry_events (
  id bigserial primary key,
  kind text not null check (kind in ('web-vital', 'client-error', 'interaction')),
  name text not null,
  value double precision,
  rating text,
  path text not null,
  message text,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now()
);

create index if not exists telemetry_events_recent
  on telemetry_events (received_at desc, kind, name);

create table if not exists atlas_annotations (
  id uuid primary key default gen_random_uuid(),
  election_id text not null references election_editions(id),
  constituency_id text not null,
  annotation_type text not null check (annotation_type in ('close-contest', 'swing', 'turnout', 'editorial')),
  title text not null,
  body text not null,
  metric_value double precision,
  revision_id uuid references editorial_revisions(id),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  unique (election_id, constituency_id, annotation_type)
);

create or replace function protect_published_election_results()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from election_editions
    where id = coalesce(old.election_id, new.election_id)
      and publication_status = 'published'
  ) then
    raise exception 'Published election results are immutable; create an editorial revision.';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists immutable_published_contests on contests;
create trigger immutable_published_contests
before update or delete on contests
for each row execute function protect_published_election_results();
