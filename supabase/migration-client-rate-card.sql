-- Adds a nullable jsonb column for per-client billing rates (what we
-- charge the client, not what we pay the appraiser - see fee_catalog
-- for the cost side).
--
-- Shape (every key optional; readers default missing keys to null):
-- {
--   "primary": {
--     "acv":      { "bare": <num|null>, "withRta": <num|null> },
--     "dv":       { "bare": <num|null>, "withRta": <num|null> },
--     "estimate": { "bare": <num|null>, "withRta": <num|null> },
--     "storage":  { "bare": <num|null>, "withRta": <num|null> }
--   },
--   "addOns": {
--     "desk": <num|null>, "lou": <num|null>, "full": <num|null>,
--     "salvage": <num|null>, "specialty": <num|null>, "other": <num|null>,
--     "umpire": <num|null>, "carfax": <num|null>,
--     "windowSticker": <num|null>, "rush": <num|null>,
--     "cancellation": <num|null>
--   },
--   "time": { "hourly": <num|null>, "mileage": <num|null> }
-- }
--
-- Null leaves mean "no rate set"; consumers must distinguish null from 0.
-- No backfill - every existing client starts with rate_card = NULL and the
-- UI normalizes NULL to the all-null shell on read.

alter table public.clients
  add column if not exists rate_card jsonb null;

comment on column public.clients.rate_card is
  'Per-client billing rates (primary assignment types, add-ons, time). '
  'Null leaves mean "no rate set"; consumers must distinguish null from 0.';
