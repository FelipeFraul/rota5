create table if not exists public.whatsapp_message_batches (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  status text not null default 'collecting',
  first_message_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  process_after timestamptz not null default now() + interval '30 seconds',
  claimed_at timestamptz null,
  processed_at timestamptz null,
  cancelled_at timestamptz null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_message_batches_status_check check (
    status in ('collecting', 'processing', 'processed', 'cancelled')
  ),
  constraint whatsapp_message_batches_version_positive_check check (version > 0)
);

create table if not exists public.whatsapp_message_batch_messages (
  batch_id uuid not null references public.whatsapp_message_batches(id) on delete cascade,
  whatsapp_message_id uuid not null references public.whatsapp_messages(id) on delete cascade,
  position integer not null,
  created_at timestamptz not null default now(),
  primary key (batch_id, whatsapp_message_id),
  constraint whatsapp_message_batch_messages_position_positive_check check (position > 0)
);

create unique index if not exists whatsapp_message_batch_messages_message_unique_idx
on public.whatsapp_message_batch_messages(whatsapp_message_id);

create index if not exists whatsapp_message_batches_collecting_due_idx
on public.whatsapp_message_batches(process_after, conversation_id)
where status = 'collecting';

create index if not exists whatsapp_message_batches_conversation_status_idx
on public.whatsapp_message_batches(conversation_id, status, updated_at desc);

drop trigger if exists set_whatsapp_message_batches_updated_at on public.whatsapp_message_batches;
create trigger set_whatsapp_message_batches_updated_at
before update on public.whatsapp_message_batches
for each row execute function public.set_updated_at();

create or replace function public.append_whatsapp_message_batch(
  batch_conversation_id uuid,
  batch_message_id uuid,
  message_is_actionable boolean,
  collect_seconds integer default 30,
  max_window_seconds integer default 30
)
returns table (
  batch_id uuid,
  batch_status text,
  should_process_now boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_batch public.whatsapp_message_batches%rowtype;
  target_batch_id uuid;
  next_position integer;
  now_value timestamptz := now();
  bounded_collect_seconds integer := greatest(1, least(coalesce(collect_seconds, 30), 300));
  bounded_max_window_seconds integer := greatest(1, least(coalesce(max_window_seconds, 30), 600));
begin
  select *
  into existing_batch
  from public.whatsapp_message_batches
  where conversation_id = batch_conversation_id
    and status = 'collecting'
  order by first_message_at asc
  limit 1
  for update skip locked;

  if existing_batch.id is null then
    insert into public.whatsapp_message_batches (
      conversation_id,
      first_message_at,
      last_message_at,
      process_after
    )
    values (
      batch_conversation_id,
      now_value,
      now_value,
      least(
        now_value + make_interval(secs => bounded_collect_seconds),
        now_value + make_interval(secs => bounded_max_window_seconds)
      )
    )
    returning id into target_batch_id;

    next_position := 1;
  else
    target_batch_id := existing_batch.id;

    select coalesce(max(position), 0) + 1
    into next_position
    from public.whatsapp_message_batch_messages
    where batch_id = target_batch_id;

    update public.whatsapp_message_batches
    set
      last_message_at = now_value,
      process_after = least(
        now_value + make_interval(secs => bounded_collect_seconds),
        existing_batch.first_message_at + make_interval(secs => bounded_max_window_seconds)
      ),
      version = version + 1
    where id = target_batch_id;
  end if;

  insert into public.whatsapp_message_batch_messages (
    batch_id,
    whatsapp_message_id,
    position
  )
  values (
    target_batch_id,
    batch_message_id,
    next_position
  )
  on conflict (whatsapp_message_id) do nothing;

  if message_is_actionable then
    update public.whatsapp_message_batches
    set
      status = 'cancelled',
      cancelled_at = now_value,
      process_after = now_value,
      version = version + 1
    where id = target_batch_id
      and status = 'collecting';

    return query select target_batch_id, 'cancelled'::text, true;
    return;
  end if;

  return query select target_batch_id, 'collecting'::text, false;
end;
$$;

create or replace function public.claim_due_whatsapp_message_batches(
  batch_limit integer default 20
)
returns table (
  batch_id uuid,
  conversation_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select id
    from public.whatsapp_message_batches
    where status = 'collecting'
      and process_after <= now()
    order by process_after asc
    limit greatest(1, least(coalesce(batch_limit, 20), 100))
    for update skip locked
  ),
  claimed as (
    update public.whatsapp_message_batches b
    set
      status = 'processing',
      claimed_at = now(),
      version = version + 1
    from due
    where b.id = due.id
    returning b.id, b.conversation_id
  )
  select claimed.id, claimed.conversation_id
  from claimed;
end;
$$;

create or replace function public.finish_whatsapp_message_batch(
  target_batch_id uuid,
  final_status text default 'processed'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if final_status not in ('processed', 'cancelled') then
    raise exception 'invalid_batch_final_status';
  end if;

  update public.whatsapp_message_batches
  set
    status = final_status,
    processed_at = case when final_status = 'processed' then now() else processed_at end,
    cancelled_at = case when final_status = 'cancelled' then now() else cancelled_at end,
    version = version + 1
  where id = target_batch_id
    and status in ('processing', 'collecting', 'cancelled');

  return found;
end;
$$;

alter table public.whatsapp_message_batches enable row level security;
alter table public.whatsapp_message_batch_messages enable row level security;

revoke all on table public.whatsapp_message_batches from public;
revoke all on table public.whatsapp_message_batches from anon;
revoke all on table public.whatsapp_message_batches from authenticated;
grant all on table public.whatsapp_message_batches to service_role;

revoke all on table public.whatsapp_message_batch_messages from public;
revoke all on table public.whatsapp_message_batch_messages from anon;
revoke all on table public.whatsapp_message_batch_messages from authenticated;
grant all on table public.whatsapp_message_batch_messages to service_role;

revoke all on function public.append_whatsapp_message_batch(uuid, uuid, boolean, integer, integer) from public;
revoke all on function public.append_whatsapp_message_batch(uuid, uuid, boolean, integer, integer) from anon;
revoke all on function public.append_whatsapp_message_batch(uuid, uuid, boolean, integer, integer) from authenticated;
grant execute on function public.append_whatsapp_message_batch(uuid, uuid, boolean, integer, integer) to service_role;

revoke all on function public.claim_due_whatsapp_message_batches(integer) from public;
revoke all on function public.claim_due_whatsapp_message_batches(integer) from anon;
revoke all on function public.claim_due_whatsapp_message_batches(integer) from authenticated;
grant execute on function public.claim_due_whatsapp_message_batches(integer) to service_role;

revoke all on function public.finish_whatsapp_message_batch(uuid, text) from public;
revoke all on function public.finish_whatsapp_message_batch(uuid, text) from anon;
revoke all on function public.finish_whatsapp_message_batch(uuid, text) from authenticated;
grant execute on function public.finish_whatsapp_message_batch(uuid, text) to service_role;

comment on table public.whatsapp_message_batches
is 'Collects short non-actionable inbound WhatsApp messages before a single aggregated response.';

comment on function public.claim_due_whatsapp_message_batches(integer)
is 'Atomically claims due WhatsApp message batches using row locks and skip locked.';
