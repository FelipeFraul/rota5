-- Supabase default privileges may grant service_role more than nextval requires.
-- Keep only the minimum sequence privilege used by confirm_paid_combo_order.

revoke all on sequence public.combo_redemption_code_seq from service_role;
grant usage on sequence public.combo_redemption_code_seq to service_role;
