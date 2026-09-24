-- The catalog now operates on ordinary products only.
-- Preserve the tables for backwards-compatible deployed code, but clear all
-- existing bundle/group relationships and records.
DELETE FROM product_group_items;
DELETE FROM product_groups;
