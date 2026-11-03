-- Business consoles, stage 3 (20261118000000_business_orders.sql): a product goes into a business only
-- by the seller who listed it and owns the business; then its team sees and handles its orders (and who
-- did is kept), ships them with one of the business's own drivers, and buyers pay the business's
-- details; orders made before keep no business; nobody else gets in; staff never change the product or
-- the drivers; a paused business's team can do nothing and buyers pay the seller as before. Rolled back.
\set ON_ERROR_STOP on
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'seller@dealer.in'),
  ('00000000-0000-0000-0000-0000000000e2', 'staff@dealer.in'),
  ('00000000-0000-0000-0000-0000000000e5', 'buyer@orchard.in'),
  ('00000000-0000-0000-0000-0000000000e9', 'other@business.in')
on conflict do nothing;
insert into public.organisations (id, name, kind, created_by) values
  ('00000000-0000-0000-0000-00000000ab01', 'Sopore Agro Inputs', 'dealer', '00000000-0000-0000-0000-0000000000e1'),
  ('00000000-0000-0000-0000-00000000ab09', 'Other Business', 'dealer', '00000000-0000-0000-0000-0000000000e9');
insert into public.org_members (org_id, user_id, role) values
  ('00000000-0000-0000-0000-00000000ab01', '00000000-0000-0000-0000-0000000000e1', 'owner'),
  ('00000000-0000-0000-0000-00000000ab01', '00000000-0000-0000-0000-0000000000e2', 'staff'),
  ('00000000-0000-0000-0000-00000000ab09', '00000000-0000-0000-0000-0000000000e9', 'owner');
insert into public.payout_accounts (user_id, account_name, upi_id) values ('00000000-0000-0000-0000-0000000000e1', 'Seller', 'personal@okbank');
insert into public.org_payout_accounts (org_id, account_name, upi_id) values ('00000000-0000-0000-0000-00000000ab01', 'Sopore Agro Inputs', 'business@okbank');
insert into public.org_drivers (id, org_id, name, phone, vehicle) values
  ('00000000-0000-0000-0000-00000000dd09', '00000000-0000-0000-0000-00000000ab09', 'Other Driver', '9800000009', 'JK05 C 9999');
insert into public.market_listings (id, seller_id, seller_name, phone, district, category, product, unit, price, quantity, active) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1', 'Seller', '9876543210', 'Baramulla', 'supplies', 'Apple crates', 'piece', 100, 50, true),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000e1', 'Seller', '9876543210', 'Baramulla', 'supplies', 'Pruning saw', 'piece', 400, 5, false);
-- An order made before the product is in the business.
insert into public.market_orders (id, listing_id, buyer_id, buyer_name, buyer_phone, delivery_address, quantity, pay_first, basket)
  values ('00000000-0000-0000-0000-00000000ee01', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e5', 'Buyer', '9876500000', 'Village road, Sopore', 2, true, '00000000-0000-0000-0000-00000000ba01');
create temp table t (step text, ok boolean);
grant all on t to authenticated;

set local role authenticated;
-- Before the product is in the business: staff see and do nothing.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', true);
insert into t select 'staff see no orders of a product outside the business', count(*) = 0 from public.market_orders;
do $$ begin
  perform public.kr_order_action('00000000-0000-0000-0000-00000000ee01', 'accept');
  insert into t values ('staff cannot accept before', false);
exception when others then insert into t values ('staff cannot accept before', true);
end $$;
-- Another business owner cannot take the product.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e9', true);
do $$ begin
  perform public.kr_org_attach_product('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000ab09');
  insert into t values ('nobody takes another seller''s product', false);
exception when others then insert into t values ('nobody takes another seller''s product', true);
end $$;
insert into t select 'other businesses see no drivers but their own', count(*) = 1 from public.org_drivers;
-- The seller cannot put it in a business they do not own, nor give the product away.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
do $$ begin
  update public.market_listings set org_id = '00000000-0000-0000-0000-00000000ab09' where id = '00000000-0000-0000-0000-0000000000f1';
  insert into t values ('only into a business they own', false);
exception when others then insert into t values ('only into a business they own', true);
end $$;
do $$ begin
  update public.market_listings set seller_id = '00000000-0000-0000-0000-0000000000e9' where id = '00000000-0000-0000-0000-0000000000f1';
  insert into t values ('a product stays with its seller', false);
exception when others then insert into t values ('a product stays with its seller', true);
end $$;
-- The owner puts both products in the business, and adds a driver.
select public.kr_org_attach_product('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000ab01');
select public.kr_org_attach_product('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000ab01');
select public.kr_org_driver_save('00000000-0000-0000-0000-00000000ab01', 'Bashir Ahmad', '+91 98000 00001', 'jk05 a 1234');
insert into t select 'the driver is kept as written', name = 'Bashir Ahmad' and phone = '9800000001' and vehicle = 'JK05 A 1234'
  from public.org_drivers where org_id = '00000000-0000-0000-0000-00000000ab01';
reset role;
-- A new order: it belongs to the product's business, whatever is sent, and nobody is named as having handled it.
insert into public.market_orders (id, listing_id, buyer_id, buyer_name, buyer_phone, delivery_address, quantity, pay_first, basket, org_id, handled_by)
  values ('00000000-0000-0000-0000-00000000ee02', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e5', 'Buyer', '9876500000', 'Village road, Sopore', 3, true, '00000000-0000-0000-0000-00000000ba02',
          '00000000-0000-0000-0000-00000000ab09', '00000000-0000-0000-0000-0000000000e9');
insert into t select 'a new order belongs to the product''s business', org_id = '00000000-0000-0000-0000-00000000ab01' and handled_by is null from public.market_orders where id = '00000000-0000-0000-0000-00000000ee02';
insert into t select 'an order made before keeps no business', org_id is null from public.market_orders where id = '00000000-0000-0000-0000-00000000ee01';
update public.market_orders set org_id = '00000000-0000-0000-0000-00000000ab09' where id = '00000000-0000-0000-0000-00000000ee02';
insert into t select 'an order''s business never changes', org_id = '00000000-0000-0000-0000-00000000ab01' from public.market_orders where id = '00000000-0000-0000-0000-00000000ee02';

set local role authenticated;
-- Staff see the business's products (even the hidden one), its drivers and its new order; they accept it.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', true);
insert into t select 'staff see the hidden product of the business', count(*) = 1 from public.market_listings where id = '00000000-0000-0000-0000-0000000000f2';
insert into t select 'staff see only the business''s order', count(*) = 1 from public.market_orders;
insert into t select 'staff see the business''s drivers only', count(*) = 1 from public.org_drivers;
select public.kr_order_action('00000000-0000-0000-0000-00000000ee02', 'accept');
insert into t select 'staff accept, and it says who', status = 'accepted' and handled_by = '00000000-0000-0000-0000-0000000000e2' from public.market_orders where id = '00000000-0000-0000-0000-00000000ee02';
-- Staff never change the product or the drivers.
update public.market_listings set price = 1 where id = '00000000-0000-0000-0000-0000000000f1';
do $$ begin
  perform public.kr_org_attach_product('00000000-0000-0000-0000-0000000000f1', null);
  insert into t values ('staff cannot take the product out', false);
exception when others then insert into t values ('staff cannot take the product out', true);
end $$;
do $$ begin
  perform public.kr_org_driver_save('00000000-0000-0000-0000-00000000ab01', 'Staff Friend', '9800000002', null);
  insert into t values ('staff cannot add drivers', false);
exception when others then insert into t values ('staff cannot add drivers', true);
end $$;
-- The buyer is asked to pay the business, and pays.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e5', true);
insert into t select 'the buyer pays the business', upi_id = 'business@okbank' from public.kr_payment_details('order', '00000000-0000-0000-0000-00000000ee02');
select public.kr_order_action('00000000-0000-0000-0000-00000000ee02', 'pay', 'UTR123456789');
do $$ begin
  perform public.kr_order_assign_driver('00000000-0000-0000-0000-00000000ee02', (select id from public.org_drivers limit 1));
  insert into t values ('the buyer cannot give the order a driver', false);
exception when others then insert into t values ('the buyer cannot give the order a driver', true);
end $$;
-- Staff confirm the money, then ship with the business's driver — never another business's.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', true);
select public.kr_order_action('00000000-0000-0000-0000-00000000ee02', 'confirm_payment');
do $$ begin
  perform public.kr_order_assign_driver('00000000-0000-0000-0000-00000000ee02', '00000000-0000-0000-0000-00000000dd09');
  insert into t values ('only the business''s own driver', false);
exception when others then insert into t values ('only the business''s own driver', true);
end $$;
select public.kr_order_assign_driver('00000000-0000-0000-0000-00000000ee02', (select id from public.org_drivers where phone = '9800000001'));
insert into t select 'shipped with the driver, and it says who', status = 'shipped' and driver_name = 'Bashir Ahmad' and driver_phone = '9800000001' and ship_vehicle = 'JK05 A 1234' and handled_by = '00000000-0000-0000-0000-0000000000e2'
  from public.market_orders where id = '00000000-0000-0000-0000-00000000ee02';
insert into t values ('staff get the driver''s link', char_length(public.kr_order_driver_link('00000000-0000-0000-0000-00000000ee02')) >= 32);
-- Someone outside sees and does nothing.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e9', true);
insert into t select 'outsiders see no orders', count(*) = 0 from public.market_orders;
do $$ begin
  perform public.kr_order_driver_link('00000000-0000-0000-0000-00000000ee02');
  insert into t values ('outsiders get no driver link', false);
exception when others then insert into t values ('outsiders get no driver link', true);
end $$;
do $$ begin
  perform public.kr_order_location('00000000-0000-0000-0000-00000000ee02', 34.3, 74.4);
  insert into t values ('outsiders cannot move the vehicle', false);
exception when others then insert into t values ('outsiders cannot move the vehicle', true);
end $$;
reset role;
insert into t select 'the price is unchanged', price = 100 from public.market_listings where id = '00000000-0000-0000-0000-0000000000f1';

-- KashRoot pauses the business: its team can do nothing; buyers pay the seller as before.
update public.organisations set suspended_at = now(), suspended_reason = 'test' where id = '00000000-0000-0000-0000-00000000ab01';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', true);
insert into t select 'a paused business''s staff see no orders', count(*) = 0 from public.market_orders;
do $$ begin
  perform public.kr_order_location('00000000-0000-0000-0000-00000000ee02', 34.3, 74.4);
  insert into t values ('a paused business''s staff cannot act', false);
exception when others then insert into t values ('a paused business''s staff cannot act', true);
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e5', true);
insert into t select 'then the buyer pays the seller', upi_id = 'personal@okbank' from public.kr_payment_details('order', '00000000-0000-0000-0000-00000000ee02');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
select public.kr_order_location('00000000-0000-0000-0000-00000000ee02', 34.3, 74.4);
insert into t select 'the seller still can', last_lat = 34.3 from public.market_orders where id = '00000000-0000-0000-0000-00000000ee02';
do $$ begin
  perform public.kr_org_driver_remove((select id from public.org_drivers where phone = '9800000001'));
  insert into t values ('a paused business changes no drivers', false);
exception when others then insert into t values ('a paused business changes no drivers', true);
end $$;
reset role;

select count(*) filter (where not ok) > 0 as bad, string_agg(step, ', ') filter (where not ok) as which from t \gset
\if :bad
\echo 'FAIL: business orders —' :'which'
select 1 / 0 as fail;
\else
\echo 'PASS: a business''s team handles its shop orders and drivers; nobody else; no one takes a product; a paused business does nothing'
\endif
