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
    where public.whatsapp_message_batch_messages.batch_id = target_batch_id;

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

revoke all on function public.append_whatsapp_message_batch(uuid, uuid, boolean, integer, integer) from public;
revoke all on function public.append_whatsapp_message_batch(uuid, uuid, boolean, integer, integer) from anon;
revoke all on function public.append_whatsapp_message_batch(uuid, uuid, boolean, integer, integer) from authenticated;
grant execute on function public.append_whatsapp_message_batch(uuid, uuid, boolean, integer, integer) to service_role;
