revoke all on function public.update_admin_event_venue(uuid, uuid, text, text, text) from public;
revoke all on function public.update_admin_event_venue(uuid, uuid, text, text, text) from anon;
revoke all on function public.update_admin_event_venue(uuid, uuid, text, text, text) from authenticated;
revoke all on function public.update_admin_event_venue(uuid, uuid, text, text, text) from service_role;

drop function public.update_admin_event_venue(uuid, uuid, text, text, text);
