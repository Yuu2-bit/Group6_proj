

create table if not exists customers (
  id            bigint generated always as identity primary key,
  customer_code text,
  name          text not null,
  type          text default 'Individual',
  contact       text,
  address       text,
  location      text,
  status        text default 'Active',
  created_at    timestamptz default now()
);
alter table customers add column if not exists address text;

create table if not exists job_orders (
  id             bigint generated always as identity primary key,
  customer_id    bigint references customers(id),
  device         text not null,
  serial         text,
  service        text,
  issue          text,
  status         text default 'For Checking',
  status_started timestamptz default now(),
  amount         numeric(12,2) default 0,
  date_received  timestamptz default now()
);
alter table job_orders add column if not exists received_by text;
alter table job_orders add column if not exists form_data jsonb default '{}'::jsonb;  -- paper-form answers (replaces browser localStorage)

create table if not exists payments (
  id           bigint generated always as identity primary key,
  job_order_no text not null,                       -- e.g. JO-00012
  customer     text,
  amount       numeric(12,2) not null check (amount > 0),
  method       text default 'Cash',
  reference_no text,
  paid_date    date not null,
  received_by  text,
  notes        text,
  created_at   timestamptz default now()
);

create table if not exists inventory_items (
  id            bigint generated always as identity primary key,
  sku           text not null unique,
  category      text,
  brand         text,
  description   text,
  supplier      text,
  stock         integer not null default 0 check (stock >= 0),
  reorder       integer not null default 0,
  unit_cost     numeric(12,2) default 0,
  selling_price numeric(12,2) default 0,
  active        boolean default true
);

create table if not exists inventory_transactions (
  id               bigint generated always as identity primary key,
  item_id          bigint not null references inventory_items(id),
  type             text not null check (type in ('in','out')),
  quantity         integer not null check (quantity > 0),
  transaction_type text,
  reference_no     text,
  remarks          text,
  staff            text,
  unit_cost        numeric(12,2),
  processed_by     text,
  created_at       timestamptz default now()
);

create index if not exists idx_jobs_customer   on job_orders(customer_id);
create index if not exists idx_jobs_status     on job_orders(status);
create index if not exists idx_pay_job         on payments(job_order_no);
create index if not exists idx_pay_date        on payments(paid_date);
create index if not exists idx_tx_item         on inventory_transactions(item_id);

-- Changes stock and writes the history in one safe step (row is locked meanwhile)
create or replace function apply_stock_movement(
  p_item_id bigint, p_type text, p_quantity int, p_transaction_type text,
  p_reference_no text, p_remarks text, p_staff text, p_unit_cost numeric, p_processed_by text
) returns inventory_items
language plpgsql as $$
declare v inventory_items;
begin
  select * into v from inventory_items where id = p_item_id for update;
  if not found then raise exception 'ITEM_NOT_FOUND'; end if;
  if p_type = 'out' and v.stock < p_quantity then
    raise exception 'INSUFFICIENT_STOCK:%', v.stock;
  end if;

  update inventory_items
     set stock = case when p_type = 'in' then stock + p_quantity else stock - p_quantity end
   where id = p_item_id
   returning * into v;

  insert into inventory_transactions
    (item_id, type, quantity, transaction_type, reference_no, remarks, staff, unit_cost, processed_by)
  values
    (p_item_id, p_type, p_quantity, p_transaction_type, p_reference_no, p_remarks, p_staff, p_unit_cost, p_processed_by);

  return v;
end $$;

