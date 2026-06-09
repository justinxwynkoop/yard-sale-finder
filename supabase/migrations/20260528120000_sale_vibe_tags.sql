-- "Vibe" tags are short, host-supplied descriptors that surface in the
-- map filter sheet ("Early bird welcome", "Cash only", "Block sale", etc).
-- Stored as a TEXT[] column (mirrors the existing categories pattern on
-- sales) so we can keep things in one row and query with the @> operator.
--
-- Defaults to an empty array so existing rows + create-sale flows that
-- don't set this column keep working. RLS is unchanged — owners can
-- update any column they own; everyone can read.

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS vibe_tags TEXT[] NOT NULL DEFAULT '{}';

-- GIN index supports fast @> / && containment queries the filter sheet
-- runs (e.g. "sales whose vibe_tags include 'cash_only'"). Without an
-- index, those degrade to a sequential scan as the table grows.
CREATE INDEX IF NOT EXISTS sales_vibe_tags_gin_idx
  ON public.sales USING GIN (vibe_tags);
