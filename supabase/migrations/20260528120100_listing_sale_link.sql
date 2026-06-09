-- Optional link from a one-off listing to a yard sale, so the
-- SaleDetailScreen Featured Items rail can show actual items the
-- host plans to bring to the sale (with prices), not just photos.
--
-- Nullable: most listings exist independent of any sale. The host
-- opts in by tagging a listing with the sale it's part of.
--
-- RLS: existing listing policies already gate INSERT/UPDATE on
-- owner check (auth.uid() = user_id). Cross-checking that the host
-- actually owns the sale they're linking to is enforced at the
-- application layer for v1 -- adding a DB-level check would require
-- a SECURITY DEFINER function or a trigger, which is heavier than
-- the value at this stage.

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL;

-- Indexed for the common "load every linked listing for this sale"
-- query the Featured Items rail runs on SaleDetailScreen.
CREATE INDEX IF NOT EXISTS listings_sale_id_idx
  ON public.listings (sale_id) WHERE sale_id IS NOT NULL;
