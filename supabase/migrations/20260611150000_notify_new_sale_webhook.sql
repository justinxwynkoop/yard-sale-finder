-- Database webhook: on a new sale, call the notify-new-sale edge function
-- (which pushes "X posted a new sale" to the host's followers). This is
-- the code-defined equivalent of a dashboard Database Webhook — a trigger
-- that POSTs the new row to the function via supabase_functions.http_request.
--
-- The function is deployed with --no-verify-jwt, so no auth header needed.
-- (Single prod project for now, so the URL is hardcoded; revisit if/when
-- a staging project exists.)

drop trigger if exists notify_new_sale_webhook on public.sales;
create trigger notify_new_sale_webhook
  after insert on public.sales
  for each row
  execute function supabase_functions.http_request(
    'https://dxahcamntwtuzftxbxgx.supabase.co/functions/v1/notify-new-sale',
    'POST',
    '{"Content-Type":"application/json"}',
    '{}',
    '5000'
  );
