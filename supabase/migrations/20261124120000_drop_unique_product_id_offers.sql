-- Allow multiple offers per product
alter table offers drop constraint if exists offers_product_id_key;
