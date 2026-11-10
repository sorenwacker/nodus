-- A pinned card keeps its position: layouts, physics and drags leave it where
-- it is (PRODUCT_DESIGN.md > Pinned cards)
ALTER TABLE nodes ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0;
