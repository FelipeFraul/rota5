alter table public.whatsapp_message_batches
add column if not exists processing_started_at timestamptz null,
add column if not exists attempt_count integer not null default 0,
add column if not exists next_attempt_at timestamptz null,
add column if not exists last_error_code text null,
add column if not exists last_error_at timestamptz null;

alter table public.whatsapp_message_batches
drop constraint if exists whatsapp_message_batches_status_check;

alter table public.whatsapp_message_batches
add constraint whatsapp_message_batches_status_check check (
  status in ('collecting', 'processing', 'processed', 'cancelled', 'failed')
);

alter table public.whatsapp_message_batches
drop constraint if exists whatsapp_message_batches_attempt_count_non_negative_check;

alter table public.whatsapp_message_batches
add constraint whatsapp_message_batches_attempt_count_non_negative_check
check (attempt_count >= 0);

create index if not exists whatsapp_message_batches_retry_due_idx
on public.whatsapp_message_batches(next_attempt_at, processing_started_at, updated_at)
where status in ('collecting', 'processing');

create or replace function public.claim_due_whatsapp_message_batches(
  batch_limit integer default 20,
  processing_timeout_seconds integer default 300,
  max_attempts integer default 3
)
returns table (
  batch_id uuid,
  conversation_id uuid,
  attempt_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  now_value timestamptz := now();
  bounded_limit integer := greatest(1, least(coalesce(batch_limit, 20), 100));
  bounded_processing_timeout_seconds integer := greatest(
    30,
    least(coalesce(processing_timeout_seconds, 300), 3600)
  );
  bounded_max_attempts integer := greatest(1, least(coalesce(max_attempts, 3), 10));
begin
  return query
  with due as (
    select id
    from public.whatsapp_message_batches
    where (
        (
          status = 'collecting'
          and process_after <= now_value
          and coalesce(next_attempt_at, process_after) <= now_value
        )
        or (
          status = 'processing'
          and coalesce(processing_started_at, claimed_at, updated_at)
            <= now_value - make_interval(secs => bounded_processing_timeout_seconds)
          and coalesce(next_attempt_at, now_value) <= now_value
        )
      )
      and attempt_count < bounded_max_attempts
    order by coalesce(next_attempt_at, process_after, updated_at) asc
    limit bounded_limit
    for update skip locked
  ),
  claimed as (
    update public.whatsapp_message_batches b
    set
      status = 'processing',
      claimed_at = now_value,
      processing_started_at = now_value,
      attempt_count = b.attempt_count + 1,
      last_error_code = null,
      last_error_at = null,
      version = version + 1
    from due
    where b.id = due.id
    returning b.id, b.conversation_id, b.attempt_count
  )
  select claimed.id, claimed.conversation_id, claimed.attempt_count
  from claimed;
end;
$$;

create or replace function public.finish_whatsapp_message_batch(
  target_batch_id uuid,
  final_status text default 'processed',
  error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if final_status not in ('processed', 'cancelled', 'failed') then
    raise exception 'invalid_batch_final_status';
  end if;

  update public.whatsapp_message_batches
  set
    status = final_status,
    processed_at = case when final_status = 'processed' then now() else processed_at end,
    cancelled_at = case when final_status in ('cancelled', 'failed') then now() else cancelled_at end,
    processing_started_at = null,
    next_attempt_at = null,
    last_error_code = left(nullif(error_code, ''), 80),
    last_error_at = case when error_code is null then last_error_at else now() end,
    version = version + 1
  where id = target_batch_id
    and status in ('processing', 'collecting', 'cancelled');

  return found;
end;
$$;

create or replace function public.reschedule_whatsapp_message_batch(
  target_batch_id uuid,
  retry_after_seconds integer default 60,
  error_code text default 'retryable_error',
  max_attempts integer default 3
)
returns table (
  rescheduled boolean,
  failed boolean,
  attempt_count integer,
  next_attempt_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  now_value timestamptz := now();
  bounded_retry_after_seconds integer := greatest(10, least(coalesce(retry_after_seconds, 60), 3600));
  bounded_max_attempts integer := greatest(1, least(coalesce(max_attempts, 3), 10));
  updated_row public.whatsapp_message_batches%rowtype;
begin
  update public.whatsapp_message_batches
  set
    status = case
      when attempt_count >= bounded_max_attempts then 'failed'
      else 'collecting'
    end,
    processing_started_at = null,
    next_attempt_at = case
      when attempt_count >= bounded_max_attempts then null
      else now_value + make_interval(secs => bounded_retry_after_seconds)
    end,
    process_after = case
      when attempt_count >= bounded_max_attempts then process_after
      else now_value + make_interval(secs => bounded_retry_after_seconds)
    end,
    cancelled_at = case
      when attempt_count >= bounded_max_attempts then now_value
      else cancelled_at
    end,
    last_error_code = left(coalesce(nullif(error_code, ''), 'retryable_error'), 80),
    last_error_at = now_value,
    version = version + 1
  where id = target_batch_id
    and status = 'processing'
  returning * into updated_row;

  if updated_row.id is null then
    return query select false, false, 0, null::timestamptz;
    return;
  end if;

  return query select
    updated_row.status = 'collecting',
    updated_row.status = 'failed',
    updated_row.attempt_count,
    updated_row.next_attempt_at;
end;
$$;

revoke all on function public.claim_due_whatsapp_message_batches(integer, integer, integer) from public;
revoke all on function public.claim_due_whatsapp_message_batches(integer, integer, integer) from anon;
revoke all on function public.claim_due_whatsapp_message_batches(integer, integer, integer) from authenticated;
grant execute on function public.claim_due_whatsapp_message_batches(integer, integer, integer) to service_role;

revoke all on function public.finish_whatsapp_message_batch(uuid, text, text) from public;
revoke all on function public.finish_whatsapp_message_batch(uuid, text, text) from anon;
revoke all on function public.finish_whatsapp_message_batch(uuid, text, text) from authenticated;
grant execute on function public.finish_whatsapp_message_batch(uuid, text, text) to service_role;

revoke all on function public.reschedule_whatsapp_message_batch(uuid, integer, text, integer) from public;
revoke all on function public.reschedule_whatsapp_message_batch(uuid, integer, text, integer) from anon;
revoke all on function public.reschedule_whatsapp_message_batch(uuid, integer, text, integer) from authenticated;
grant execute on function public.reschedule_whatsapp_message_batch(uuid, integer, text, integer) to service_role;

comment on function public.reschedule_whatsapp_message_batch(uuid, integer, text, integer)
is 'Returns a processing WhatsApp batch to collecting with bounded retry/backoff or marks it failed after the attempt limit.';
