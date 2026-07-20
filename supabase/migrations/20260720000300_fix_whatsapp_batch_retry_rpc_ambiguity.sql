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
    select b.id
    from public.whatsapp_message_batches b
    where (
        (
          b.status = 'collecting'
          and b.process_after <= now_value
          and coalesce(b.next_attempt_at, b.process_after) <= now_value
        )
        or (
          b.status = 'processing'
          and coalesce(b.processing_started_at, b.claimed_at, b.updated_at)
            <= now_value - make_interval(secs => bounded_processing_timeout_seconds)
          and coalesce(b.next_attempt_at, now_value) <= now_value
        )
      )
      and b.attempt_count < bounded_max_attempts
    order by coalesce(b.next_attempt_at, b.process_after, b.updated_at) asc
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
      version = b.version + 1
    from due
    where b.id = due.id
    returning b.id, b.conversation_id, b.attempt_count
  )
  select claimed.id, claimed.conversation_id, claimed.attempt_count
  from claimed;
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
  update public.whatsapp_message_batches b
  set
    status = case
      when b.attempt_count >= bounded_max_attempts then 'failed'
      else 'collecting'
    end,
    processing_started_at = null,
    next_attempt_at = case
      when b.attempt_count >= bounded_max_attempts then null
      else now_value + make_interval(secs => bounded_retry_after_seconds)
    end,
    process_after = case
      when b.attempt_count >= bounded_max_attempts then b.process_after
      else now_value + make_interval(secs => bounded_retry_after_seconds)
    end,
    cancelled_at = case
      when b.attempt_count >= bounded_max_attempts then now_value
      else b.cancelled_at
    end,
    last_error_code = left(coalesce(nullif(error_code, ''), 'retryable_error'), 80),
    last_error_at = now_value,
    version = b.version + 1
  where b.id = target_batch_id
    and b.status = 'processing'
  returning b.* into updated_row;

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

revoke all on function public.reschedule_whatsapp_message_batch(uuid, integer, text, integer) from public;
revoke all on function public.reschedule_whatsapp_message_batch(uuid, integer, text, integer) from anon;
revoke all on function public.reschedule_whatsapp_message_batch(uuid, integer, text, integer) from authenticated;
grant execute on function public.reschedule_whatsapp_message_batch(uuid, integer, text, integer) to service_role;
