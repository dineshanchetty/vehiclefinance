-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  seed.sql — Development / staging seed data                                ║
-- ║                                                                            ║
-- ║  IMPORTANT: This file inserts a row into the `profiles` table ONLY.       ║
-- ║  The corresponding `auth.users` row must be created separately via:       ║
-- ║                                                                            ║
-- ║    Option A — Supabase Dashboard:                                          ║
-- ║      Authentication → Users → Invite user                                 ║
-- ║      Email: ops-dev@vehiclefinance.local                                  ║
-- ║                                                                            ║
-- ║    Option B — Supabase CLI:                                                ║
-- ║      supabase auth users create \                                          ║
-- ║        --email ops-dev@vehiclefinance.local \                              ║
-- ║        --password DevOps1234!                                              ║
-- ║                                                                            ║
-- ║  After the auth.users row exists, run this file:                          ║
-- ║      supabase db reset   (local)                                           ║
-- ║      psql $DATABASE_URL -f packages/api/supabase/seed.sql  (staging)      ║
-- ║                                                                            ║
-- ║  The trigger `on_auth_user_created` will have already inserted a profile  ║
-- ║  row automatically when the auth user was created. This UPSERT ensures    ║
-- ║  the role is set to `ops_agent` even if the trigger ran first.            ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

-- ── Dev ops_agent profile ─────────────────────────────────────────────────────
-- This upsert is safe to run multiple times.
-- Replace the UUID below with the actual auth.users.id after creating the user.

DO $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Look up the auth user by email
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'ops-dev@vehiclefinance.local'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'Seed: auth user ops-dev@vehiclefinance.local not found. '
      'Create it first via the Supabase dashboard or CLI, then re-run seed.sql.';
  ELSE
    INSERT INTO public.profiles (id, email, role, full_name)
    VALUES (
      v_user_id,
      'ops-dev@vehiclefinance.local',
      'ops_agent',
      'Dev Ops Agent'
    )
    ON CONFLICT (id) DO UPDATE SET
      role      = 'ops_agent',
      full_name = EXCLUDED.full_name;

    RAISE NOTICE 'Seed: upserted ops_agent profile for % (id=%)', 'ops-dev@vehiclefinance.local', v_user_id;
  END IF;
END;
$$;

-- ── Second dev user: admin ────────────────────────────────────────────────────
-- Create via dashboard/CLI with email: admin-dev@vehiclefinance.local

DO $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'admin-dev@vehiclefinance.local'
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    INSERT INTO public.profiles (id, email, role, full_name)
    VALUES (
      v_user_id,
      'admin-dev@vehiclefinance.local',
      'admin',
      'Dev Admin'
    )
    ON CONFLICT (id) DO UPDATE SET
      role      = 'admin',
      full_name = EXCLUDED.full_name;

    RAISE NOTICE 'Seed: upserted admin profile for % (id=%)', 'admin-dev@vehiclefinance.local', v_user_id;
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- Phase 6 UAT seed — 5 canonical deals for UAT sign-off testing
-- ═══════════════════════════════════════════════════════════════════
-- ─────────────────────────────────────────────────────────────────────────────
-- seed.sql
-- Development / UAT seed data.
-- Phase 2 added an ops_agent profile above this block (if any).
-- Phase 6 appends 5 canonical UAT deals below.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Ensure deals.notes column exists (idempotent) ─────────────────────────────
ALTER TABLE deals ADD COLUMN IF NOT EXISTS notes text;

-- ─────────────────────────────────────────────────────────────────────────────
-- UAT SEED: 5 canonical deals, one per pipeline status.
-- All fictional data. E.164 test phones (+27000000xxx).
-- SA ID numbers start with 0000000000 (invalid in prod).
-- VINs start with UATVIN.
-- Every deal is tagged notes = 'uat_seed' for easy teardown.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  -- ── Fixed UUIDs (deterministic so reset is idempotent) ────────────────────
  -- Buyers
  v_buyer_a  uuid := '00000000-0001-0001-0001-000000000001';
  v_buyer_b  uuid := '00000000-0001-0001-0001-000000000002';
  v_buyer_c  uuid := '00000000-0001-0001-0001-000000000003';
  v_buyer_d  uuid := '00000000-0001-0001-0001-000000000004';
  v_buyer_e  uuid := '00000000-0001-0001-0001-000000000005';

  -- Sellers
  v_seller_a uuid := '00000000-0002-0002-0002-000000000001';
  v_seller_b uuid := '00000000-0002-0002-0002-000000000002';
  v_seller_c uuid := '00000000-0002-0002-0002-000000000003';
  v_seller_d uuid := '00000000-0002-0002-0002-000000000004';
  v_seller_e uuid := '00000000-0002-0002-0002-000000000005';

  -- Vehicles
  v_veh_a    uuid := '00000000-0003-0003-0003-000000000001';
  v_veh_b    uuid := '00000000-0003-0003-0003-000000000002';
  v_veh_c    uuid := '00000000-0003-0003-0003-000000000003';
  v_veh_d    uuid := '00000000-0003-0003-0003-000000000004';
  v_veh_e    uuid := '00000000-0003-0003-0003-000000000005';

  -- Deals
  v_deal_a   uuid := '00000000-0004-0004-0004-000000000001';  -- APPLICATION_INITIATED
  v_deal_b   uuid := '00000000-0004-0004-0004-000000000002';  -- BUYER_DOCS_PENDING
  v_deal_c   uuid := '00000000-0004-0004-0004-000000000003';  -- VEHICLE_PHOTOS_PARTIAL
  v_deal_d   uuid := '00000000-0004-0004-0004-000000000004';  -- QUOTE_SENT
  v_deal_e   uuid := '00000000-0004-0004-0004-000000000005';  -- NATIS_COLLECTION_PENDING

  -- Child rows
  v_doc_1    uuid := '00000000-0005-0005-0005-000000000001';
  v_doc_2    uuid := '00000000-0005-0005-0005-000000000002';
  v_doc_3    uuid := '00000000-0005-0005-0005-000000000003';
  v_doc_4    uuid := '00000000-0005-0005-0005-000000000004';
  v_doc_5    uuid := '00000000-0005-0005-0005-000000000005';
  v_doc_6    uuid := '00000000-0005-0005-0005-000000000006';

  v_pset_c   uuid := '00000000-0006-0006-0006-000000000001';
  v_pset_d   uuid := '00000000-0006-0006-0006-000000000002';
  v_pset_e   uuid := '00000000-0006-0006-0006-000000000003';

  v_quote_d  uuid := '00000000-0007-0007-0007-000000000001';

  v_natis_e  uuid := '00000000-0008-0008-0008-000000000001';

BEGIN

-- ══════════════════════════════════════════════════════════════════════════════
-- BUYERS
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO buyers (id, first_name, last_name, id_number, phone, email,
                    date_of_birth, employment_type, employer_name,
                    monthly_income, monthly_expenses, credit_score, address)
VALUES
  -- Deal A: APPLICATION_INITIATED — brand-new applicant, no docs yet
  (v_buyer_a, 'Aiden', 'Apleni',   '0000000000001', '+27000000001',
   'buyer.a@uat.example', '2000-01-15', 'EMPLOYED', 'UAT Corp Pty Ltd',
   25000, 8000, NULL, '1 Test Street, Testville, 0001'),

  -- Deal B: BUYER_DOCS_PENDING — partially onboarded, missing bank statement
  (v_buyer_b, 'Bongi', 'Baloyi',   '0000000000002', '+27000000002',
   'buyer.b@uat.example', '1992-06-22', 'EMPLOYED', 'Demo Logistics Ltd',
   35000, 12000, NULL, '2 Sample Road, Sampleburg, 0002'),

  -- Deal C: VEHICLE_PHOTOS_PARTIAL — docs complete, waiting for photos
  (v_buyer_c, 'Caro', 'Coetzee',   '0000000000003', '+27000000003',
   'buyer.c@uat.example', '1988-11-05', 'SELF_EMPLOYED', 'Coetzee Consulting',
   50000, 18000, 680, '3 Pilot Lane, Pretoria, 0003'),

  -- Deal D: QUOTE_SENT — finance quote issued and awaiting acceptance
  (v_buyer_d, 'Dineo', 'Dlamini',  '0000000000004', '+27000000004',
   'buyer.d@uat.example', '1995-03-19', 'EMPLOYED', 'National Retail SA',
   28000, 9500, 710, '4 Quote Ave, Johannesburg, 2001'),

  -- Deal E: NATIS_COLLECTION_PENDING — deal approved, collecting NATIS docs
  (v_buyer_e, 'Ethan', 'Eksteen',  '0000000000005', '+27000000005',
   'buyer.e@uat.example', '1983-09-30', 'EMPLOYED', 'Eksteen Engineering',
   65000, 22000, 780, '5 Final Road, Cape Town, 8001')
ON CONFLICT (id) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- SELLERS
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO sellers (id, first_name, last_name, id_number, phone, email,
                     bank_name, bank_account_number, bank_branch_code)
VALUES
  (v_seller_a, 'Sonia',   'Steyn',    '0000000000011', '+27000000011',
   'seller.a@uat.example', NULL,         NULL,                 NULL),
  (v_seller_b, 'Sipho',   'Sithole',  '0000000000012', '+27000000012',
   'seller.b@uat.example', NULL,         NULL,                 NULL),
  (v_seller_c, 'Carla',   'Cilliers', '0000000000013', '+27000000013',
   'seller.c@uat.example', 'ABSA',       '9000000000001',      '632005'),
  (v_seller_d, 'David',   'de Wet',   '0000000000014', '+27000000014',
   'seller.d@uat.example', 'FNB',        '9000000000002',      '250655'),
  (v_seller_e, 'Elizma',  'Els',      '0000000000015', '+27000000015',
   'seller.e@uat.example', 'NEDBANK',    '9000000000003',      '198765')
ON CONFLICT (id) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- VEHICLES
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO vehicles (id, make, model, year, colour, vin, registration_number,
                      odometer_km, engine_number, transmission, fuel_type,
                      asking_price, agreed_price)
VALUES
  (v_veh_a, 'Toyota',  'Corolla',  2019, 'White',  'UATVIN00000000001', 'UAT001GP',
   65000,  'ENG0000001', 'AUTOMATIC', 'PETROL', 220000, NULL),
  (v_veh_b, 'VW',      'Polo',     2021, 'Silver', 'UATVIN00000000002', 'UAT002GP',
   30000,  'ENG0000002', 'MANUAL',    'PETROL', 280000, NULL),
  (v_veh_c, 'Ford',    'Ranger',   2020, 'Black',  'UATVIN00000000003', 'UAT003GP',
   80000,  'ENG0000003', 'AUTOMATIC', 'DIESEL', 450000, 440000),
  (v_veh_d, 'Hyundai', 'i20',      2022, 'Blue',   'UATVIN00000000004', 'UAT004WC',
   22000,  'ENG0000004', 'MANUAL',    'PETROL', 195000, 190000),
  (v_veh_e, 'BMW',     '3 Series', 2018, 'Grey',   'UATVIN00000000005', 'UAT005WC',
   95000,  'ENG0000005', 'AUTOMATIC', 'PETROL', 380000, 370000)
ON CONFLICT (id) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- DEALS
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO deals (id, deal_number, status, buyer_id, seller_id, vehicle_id,
                   assigned_fni_analyst, assigned_seller_agent,
                   current_blockers, sla_due_at, notes)
VALUES
  -- Deal A: APPLICATION_INITIATED
  (v_deal_a, 'UAT-2026-001', 'APPLICATION_INITIATED',
   v_buyer_a, v_seller_a, v_veh_a,
   NULL, NULL,
   ARRAY[]::text[], NOW() + INTERVAL '5 days', 'uat_seed'),

  -- Deal B: BUYER_DOCS_PENDING — bank statement outstanding
  (v_deal_b, 'UAT-2026-002', 'BUYER_DOCS_PENDING',
   v_buyer_b, v_seller_b, v_veh_b,
   NULL, NULL,
   ARRAY['Awaiting bank statement from buyer']::text[], NOW() + INTERVAL '3 days', 'uat_seed'),

  -- Deal C: VEHICLE_PHOTOS_PARTIAL — 4 of 9 angles received
  (v_deal_c, 'UAT-2026-003', 'VEHICLE_PHOTOS_PARTIAL',
   v_buyer_c, v_seller_c, v_veh_c,
   NULL, NULL,
   ARRAY['Missing vehicle photos: REAR, INTERIOR_REAR, ENGINE_BAY, ODOMETER, DAMAGE_1']::text[], NOW() + INTERVAL '2 days', 'uat_seed'),

  -- Deal D: QUOTE_SENT — finance quote sent, awaiting buyer decision
  (v_deal_d, 'UAT-2026-004', 'QUOTE_SENT',
   v_buyer_d, v_seller_d, v_veh_d,
   NULL, NULL,
   ARRAY[]::text[], NOW() + INTERVAL '7 days', 'uat_seed'),

  -- Deal E: NATIS_COLLECTION_PENDING — almost done, waiting on NATIS
  (v_deal_e, 'UAT-2026-005', 'NATIS_COLLECTION_PENDING',
   v_buyer_e, v_seller_e, v_veh_e,
   NULL, NULL,
   ARRAY['NATIS document collection pending at DLTC Bellville']::text[], NOW() + INTERVAL '10 days', 'uat_seed')
ON CONFLICT (id) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- DOCUMENTS
-- ══════════════════════════════════════════════════════════════════════════════

-- Deal B: partial docs (ID uploaded, proof of address uploaded, bank statement missing)
INSERT INTO documents (id, deal_id, owner_type, owner_id, document_type,
                        status, file_url, file_name, mime_type,
                        uploaded_at, reviewed_at)
VALUES
  (v_doc_1, v_deal_b, 'BUYER', v_buyer_b, 'ID_DOCUMENT',
   'APPROVED', 'https://storage.example/uat/doc_b_id.pdf', 'id_document.pdf', 'application/pdf',
   NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day'),
  (v_doc_2, v_deal_b, 'BUYER', v_buyer_b, 'PROOF_OF_ADDRESS',
   'APPROVED', 'https://storage.example/uat/doc_b_poa.pdf', 'proof_of_address.pdf', 'application/pdf',
   NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day'),
  -- Bank statement: pending upload
  (v_doc_3, v_deal_b, 'BUYER', v_buyer_b, 'BANK_STATEMENT',
   'PENDING', NULL, NULL, NULL, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- Deal C: all buyer docs approved
INSERT INTO documents (id, deal_id, owner_type, owner_id, document_type,
                        status, file_url, file_name, mime_type,
                        uploaded_at, reviewed_at)
VALUES
  (v_doc_4, v_deal_c, 'BUYER', v_buyer_c, 'ID_DOCUMENT',
   'APPROVED', 'https://storage.example/uat/doc_c_id.pdf', 'id_document.pdf', 'application/pdf',
   NOW() - INTERVAL '4 days', NOW() - INTERVAL '3 days'),
  (v_doc_5, v_deal_c, 'BUYER', v_buyer_c, 'PROOF_OF_INCOME',
   'APPROVED', 'https://storage.example/uat/doc_c_poi.pdf', 'proof_of_income.pdf', 'application/pdf',
   NOW() - INTERVAL '4 days', NOW() - INTERVAL '3 days'),
  (v_doc_6, v_deal_c, 'BUYER', v_buyer_c, 'BANK_STATEMENT',
   'APPROVED', 'https://storage.example/uat/doc_c_bs.pdf', 'bank_statement.pdf', 'application/pdf',
   NOW() - INTERVAL '4 days', NOW() - INTERVAL '3 days')
ON CONFLICT (id) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- VEHICLE PHOTO SETS (Deals C, D, E)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO vehicle_photo_sets (id, deal_id, vehicle_id, status)
VALUES
  (v_pset_c, v_deal_c, v_veh_c, 'UPLOADED'),   -- partial set
  (v_pset_d, v_deal_d, v_veh_d, 'APPROVED'),   -- fully approved
  (v_pset_e, v_deal_e, v_veh_e, 'APPROVED')    -- deal complete
ON CONFLICT (id) DO NOTHING;

-- Deal C: 4 of 9 angles received (FRONT, DRIVER_SIDE, PASSENGER_SIDE, INTERIOR_FRONT)
INSERT INTO vehicle_photos (id, photo_set_id, angle_type, file_url, quality_score, quality_status, upload_timestamp)
VALUES
  (gen_random_uuid(), v_pset_c, 'FRONT',           'https://storage.example/uat/c_front.jpg',        0.92, 'APPROVED', NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), v_pset_c, 'DRIVER_SIDE',     'https://storage.example/uat/c_driver.jpg',       0.88, 'APPROVED', NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), v_pset_c, 'PASSENGER_SIDE',  'https://storage.example/uat/c_passenger.jpg',    0.90, 'APPROVED', NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), v_pset_c, 'INTERIOR_FRONT',  'https://storage.example/uat/c_int_front.jpg',    0.85, 'APPROVED', NOW() - INTERVAL '1 day')
ON CONFLICT DO NOTHING;

-- Deal D: all 9 angles approved
INSERT INTO vehicle_photos (id, photo_set_id, angle_type, file_url, quality_score, quality_status, upload_timestamp)
VALUES
  (gen_random_uuid(), v_pset_d, 'FRONT',           'https://storage.example/uat/d_front.jpg',        0.95, 'APPROVED', NOW() - INTERVAL '5 days'),
  (gen_random_uuid(), v_pset_d, 'REAR',            'https://storage.example/uat/d_rear.jpg',         0.93, 'APPROVED', NOW() - INTERVAL '5 days'),
  (gen_random_uuid(), v_pset_d, 'DRIVER_SIDE',     'https://storage.example/uat/d_driver.jpg',       0.94, 'APPROVED', NOW() - INTERVAL '5 days'),
  (gen_random_uuid(), v_pset_d, 'PASSENGER_SIDE',  'https://storage.example/uat/d_passenger.jpg',    0.91, 'APPROVED', NOW() - INTERVAL '5 days'),
  (gen_random_uuid(), v_pset_d, 'INTERIOR_FRONT',  'https://storage.example/uat/d_int_front.jpg',    0.89, 'APPROVED', NOW() - INTERVAL '5 days'),
  (gen_random_uuid(), v_pset_d, 'INTERIOR_REAR',   'https://storage.example/uat/d_int_rear.jpg',     0.87, 'APPROVED', NOW() - INTERVAL '5 days'),
  (gen_random_uuid(), v_pset_d, 'ENGINE_BAY',      'https://storage.example/uat/d_engine.jpg',       0.90, 'APPROVED', NOW() - INTERVAL '5 days'),
  (gen_random_uuid(), v_pset_d, 'ODOMETER',        'https://storage.example/uat/d_odo.jpg',          0.96, 'APPROVED', NOW() - INTERVAL '5 days'),
  (gen_random_uuid(), v_pset_d, 'DAMAGE_1',        'https://storage.example/uat/d_dmg1.jpg',         0.92, 'APPROVED', NOW() - INTERVAL '5 days')
ON CONFLICT DO NOTHING;

-- Deal E: all 9 angles approved
INSERT INTO vehicle_photos (id, photo_set_id, angle_type, file_url, quality_score, quality_status, upload_timestamp)
VALUES
  (gen_random_uuid(), v_pset_e, 'FRONT',           'https://storage.example/uat/e_front.jpg',        0.96, 'APPROVED', NOW() - INTERVAL '14 days'),
  (gen_random_uuid(), v_pset_e, 'REAR',            'https://storage.example/uat/e_rear.jpg',         0.95, 'APPROVED', NOW() - INTERVAL '14 days'),
  (gen_random_uuid(), v_pset_e, 'DRIVER_SIDE',     'https://storage.example/uat/e_driver.jpg',       0.93, 'APPROVED', NOW() - INTERVAL '14 days'),
  (gen_random_uuid(), v_pset_e, 'PASSENGER_SIDE',  'https://storage.example/uat/e_passenger.jpg',    0.94, 'APPROVED', NOW() - INTERVAL '14 days'),
  (gen_random_uuid(), v_pset_e, 'INTERIOR_FRONT',  'https://storage.example/uat/e_int_front.jpg',    0.92, 'APPROVED', NOW() - INTERVAL '14 days'),
  (gen_random_uuid(), v_pset_e, 'INTERIOR_REAR',   'https://storage.example/uat/e_int_rear.jpg',     0.90, 'APPROVED', NOW() - INTERVAL '14 days'),
  (gen_random_uuid(), v_pset_e, 'ENGINE_BAY',      'https://storage.example/uat/e_engine.jpg',       0.91, 'APPROVED', NOW() - INTERVAL '14 days'),
  (gen_random_uuid(), v_pset_e, 'ODOMETER',        'https://storage.example/uat/e_odo.jpg',          0.97, 'APPROVED', NOW() - INTERVAL '14 days'),
  (gen_random_uuid(), v_pset_e, 'DAMAGE_1',        'https://storage.example/uat/e_dmg1.jpg',         0.88, 'APPROVED', NOW() - INTERVAL '14 days')
ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- QUOTE (Deal D: QUOTE_SENT)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO quotes (id, deal_id, version, status, loan_amount, deposit_amount,
                    interest_rate, term_months, monthly_instalment, balloon_payment,
                    initiation_fee, monthly_admin_fee, insurance_premium,
                    total_cost_of_credit, sent_at, expiry_at)
VALUES
  (v_quote_d, v_deal_d, 1, 'SENT',
   175000, 15000,
   11.25, 72, 3850.00, NULL,
   1207.50, 69.00, 320.00,
   277200.00,
   NOW() - INTERVAL '2 days',
   NOW() + INTERVAL '5 days')
ON CONFLICT (id) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- NATIS FULFILMENT (Deal E: NATIS_COLLECTION_PENDING)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO natis_fulfilments (id, deal_id, vehicle_id, status,
                                submitted_at, collection_address,
                                collection_agent, notes)
VALUES
  (v_natis_e, v_deal_e, v_veh_e, 'SUBMITTED',
   NOW() - INTERVAL '3 days',
   'DLTC Bellville, 1 Oak Street, Bellville, 7530',
   'UAT Collection Agent',
   'uat_seed')
ON CONFLICT (id) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- TASKS (representative queue entries)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO tasks (id, deal_id, task_type, queue, status, priority, notes, due_at)
VALUES
  (gen_random_uuid(), v_deal_b, 'BUYER_DOC_REVIEW', 'Q_BUYER_DOC_REVIEW', 'PENDING', 'HIGH',
   'Chase missing bank statement — Deal UAT-2026-002. Buyer Bongi Baloyi has not uploaded a 3-month bank statement. Send WhatsApp reminder.',
   NOW() + INTERVAL '1 day'),
  (gen_random_uuid(), v_deal_c, 'SELLER_PHOTO_REVIEW', 'Q_SELLER_PHOTO_REVIEW', 'PENDING', 'NORMAL',
   'Request remaining vehicle photos — Deal UAT-2026-003. Seller Carla Cilliers must still upload: REAR, INTERIOR_REAR, ENGINE_BAY, ODOMETER, DAMAGE_1.',
   NOW() + INTERVAL '2 days'),
  (gen_random_uuid(), v_deal_d, 'FNI_QUOTE_PREP', 'Q_FNI_QUOTE_PREP', 'COMPLETED', 'HIGH',
   'Quote sent — Deal UAT-2026-004. Finance quote v1 sent to buyer Dineo Dlamini on ' || (NOW() - INTERVAL '2 days')::date::text || '. Awaiting response.',
   NOW() + INTERVAL '5 days'),
  (gen_random_uuid(), v_deal_e, 'NATIS_COLLECTION', 'Q_NATIS_COLLECTION', 'IN_PROGRESS', 'URGENT',
   'Collect NATIS — Deal UAT-2026-005. NATIS submitted. Collection agent must retrieve at DLTC Bellville.',
   NOW() + INTERVAL '7 days')
ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- AUDIT EVENTS
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO audit_events (id, deal_id, event_type, actor_type, actor, details)
VALUES
  (gen_random_uuid(), v_deal_a, 'DEAL_CREATED',     'SYSTEM', 'uat-seed',
   '{"source":"uat_seed","status":"APPLICATION_INITIATED"}'::jsonb),
  (gen_random_uuid(), v_deal_b, 'DEAL_CREATED',     'SYSTEM', 'uat-seed',
   '{"source":"uat_seed","status":"BUYER_DOCS_PENDING"}'::jsonb),
  (gen_random_uuid(), v_deal_b, 'DOCUMENT_APPROVED','SYSTEM', 'uat-seed',
   '{"document_type":"ID_DOCUMENT","owner":"buyer_b"}'::jsonb),
  (gen_random_uuid(), v_deal_b, 'DOCUMENT_APPROVED','SYSTEM', 'uat-seed',
   '{"document_type":"PROOF_OF_ADDRESS","owner":"buyer_b"}'::jsonb),
  (gen_random_uuid(), v_deal_c, 'DEAL_CREATED',     'SYSTEM', 'uat-seed',
   '{"source":"uat_seed","status":"VEHICLE_PHOTOS_PARTIAL"}'::jsonb),
  (gen_random_uuid(), v_deal_d, 'DEAL_CREATED',     'SYSTEM', 'uat-seed',
   '{"source":"uat_seed","status":"QUOTE_SENT"}'::jsonb),
  (gen_random_uuid(), v_deal_d, 'QUOTE_SENT',       'SYSTEM', 'uat-seed',
   '{"quote_version":1,"loan_amount":175000,"term_months":72}'::jsonb),
  (gen_random_uuid(), v_deal_e, 'DEAL_CREATED',     'SYSTEM', 'uat-seed',
   '{"source":"uat_seed","status":"NATIS_COLLECTION_PENDING"}'::jsonb),
  (gen_random_uuid(), v_deal_e, 'NATIS_SUBMITTED',  'SYSTEM', 'uat-seed',
   '{"collection_address":"DLTC Bellville"}'::jsonb)
ON CONFLICT DO NOTHING;

RAISE NOTICE 'UAT seed complete: 5 canonical deals inserted (UAT-2026-001 to UAT-2026-005).';
END;
$$;
