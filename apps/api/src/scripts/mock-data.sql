-- Mock data for Kawakawa CX
-- Run with: psql $DATABASE_URL -f apps/api/src/scripts/mock-data.sql
-- Password for all users: password123 (bcrypt hash with 12 rounds)

-- Clear existing mock data (including admin for full mock reset)
DELETE FROM order_reservations;
DELETE FROM notifications;
DELETE FROM buy_orders;
DELETE FROM sell_orders;
DELETE FROM fio_inventory;
DELETE FROM fio_user_storage;
DELETE FROM user_roles;
DELETE FROM user_settings;
DELETE FROM users;
DELETE FROM prices;
DELETE FROM price_adjustments;
DELETE FROM import_configs;
-- Clear TEST price list if it exists (seeded ones are protected by onConflictDoNothing)
DELETE FROM price_lists WHERE code = 'TEST';

-- Reset sequences
SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE((SELECT MAX(id) FROM users), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('user_settings', 'id'), COALESCE((SELECT MAX(id) FROM user_settings), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('user_roles', 'id'), COALESCE((SELECT MAX(id) FROM user_roles), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('fio_user_storage', 'id'), COALESCE((SELECT MAX(id) FROM fio_user_storage), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('fio_inventory', 'id'), COALESCE((SELECT MAX(id) FROM fio_inventory), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('sell_orders', 'id'), COALESCE((SELECT MAX(id) FROM sell_orders), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('buy_orders', 'id'), COALESCE((SELECT MAX(id) FROM buy_orders), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('order_reservations', 'id'), COALESCE((SELECT MAX(id) FROM order_reservations), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('notifications', 'id'), COALESCE((SELECT MAX(id) FROM notifications), 0) + 1, false);

-- ==================== USERS ====================
-- Password: password123 (bcrypt hash with $2b$ prefix from bcryptjs)
INSERT INTO users (id, username, email, display_name, password_hash, is_active) VALUES
  (1, 'admin', 'admin@kawakawa.local', 'Administrator', '$2b$12$abfEy/SNGi.jJ8mfri7LjuqzrQ0sZHbeRCW9fC7nLasrc0UqXAQ8.', true),
  (2, 'alice', 'alice@example.com', 'Alice Chen', '$2b$12$abfEy/SNGi.jJ8mfri7LjuqzrQ0sZHbeRCW9fC7nLasrc0UqXAQ8.', true),
  (3, 'bob', 'bob@example.com', 'Bob Williams', '$2b$12$abfEy/SNGi.jJ8mfri7LjuqzrQ0sZHbeRCW9fC7nLasrc0UqXAQ8.', true),
  (4, 'charlie', 'charlie@example.com', 'Charlie Davis', '$2b$12$abfEy/SNGi.jJ8mfri7LjuqzrQ0sZHbeRCW9fC7nLasrc0UqXAQ8.', true),
  (5, 'diana', 'diana@example.com', 'Diana Foster', '$2b$12$abfEy/SNGi.jJ8mfri7LjuqzrQ0sZHbeRCW9fC7nLasrc0UqXAQ8.', true),
  (6, 'ethan', 'ethan@example.com', 'Ethan Grant', '$2b$12$abfEy/SNGi.jJ8mfri7LjuqzrQ0sZHbeRCW9fC7nLasrc0UqXAQ8.', true),
  (7, 'fiona', 'fiona@example.com', 'Fiona Harper', '$2b$12$abfEy/SNGi.jJ8mfri7LjuqzrQ0sZHbeRCW9fC7nLasrc0UqXAQ8.', true),
  (8, 'george', 'george@example.com', 'George Irving', '$2b$12$abfEy/SNGi.jJ8mfri7LjuqzrQ0sZHbeRCW9fC7nLasrc0UqXAQ8.', true),
  (9, 'hannah', 'hannah@example.com', 'Hannah Jones', '$2b$12$abfEy/SNGi.jJ8mfri7LjuqzrQ0sZHbeRCW9fC7nLasrc0UqXAQ8.', true),
  (10, 'ivan', 'ivan@example.com', 'Ivan Kim', '$2b$12$abfEy/SNGi.jJ8mfri7LjuqzrQ0sZHbeRCW9fC7nLasrc0UqXAQ8.', true),
  (11, 'julia', 'julia@example.com', 'Julia Lee', '$2b$12$abfEy/SNGi.jJ8mfri7LjuqzrQ0sZHbeRCW9fC7nLasrc0UqXAQ8.', true),
  (12, 'kevin', 'kevin@example.com', 'Kevin Moore', '$2b$12$abfEy/SNGi.jJ8mfri7LjuqzrQ0sZHbeRCW9fC7nLasrc0UqXAQ8.', true),
  (13, 'luna', 'luna@example.com', 'Luna Nelson', '$2b$12$abfEy/SNGi.jJ8mfri7LjuqzrQ0sZHbeRCW9fC7nLasrc0UqXAQ8.', true),
  (14, 'mike', 'mike@example.com', 'Mike O''Brien', '$2b$12$abfEy/SNGi.jJ8mfri7LjuqzrQ0sZHbeRCW9fC7nLasrc0UqXAQ8.', true),
  (15, 'nora', 'nora@example.com', 'Nora Patel', '$2b$12$abfEy/SNGi.jJ8mfri7LjuqzrQ0sZHbeRCW9fC7nLasrc0UqXAQ8.', true),
  (16, 'oscar', 'oscar@example.com', 'Oscar Quinn', '$2b$12$abfEy/SNGi.jJ8mfri7LjuqzrQ0sZHbeRCW9fC7nLasrc0UqXAQ8.', true),
  (17, 'petra', 'petra@example.com', 'Petra Russo', '$2b$12$abfEy/SNGi.jJ8mfri7LjuqzrQ0sZHbeRCW9fC7nLasrc0UqXAQ8.', true),
  (18, 'quinn', 'quinn@example.com', 'Quinn Smith', '$2b$12$abfEy/SNGi.jJ8mfri7LjuqzrQ0sZHbeRCW9fC7nLasrc0UqXAQ8.', true),
  (19, 'rachel', 'rachel@example.com', 'Rachel Torres', '$2b$12$abfEy/SNGi.jJ8mfri7LjuqzrQ0sZHbeRCW9fC7nLasrc0UqXAQ8.', true),
  (20, 'steve', 'steve@example.com', 'Steve Upton', '$2b$12$abfEy/SNGi.jJ8mfri7LjuqzrQ0sZHbeRCW9fC7nLasrc0UqXAQ8.', true),
  (21, 'tara', 'tara@example.com', 'Tara Vance', '$2b$12$abfEy/SNGi.jJ8mfri7LjuqzrQ0sZHbeRCW9fC7nLasrc0UqXAQ8.', true);

-- Update sequence after explicit ID inserts
SELECT setval(pg_get_serial_sequence('users', 'id'), 21, true);

-- ==================== USER SETTINGS ====================
INSERT INTO user_settings (user_id, preferred_currency, location_display_mode, commodity_display_mode) VALUES
  (1, 'CIS', 'both', 'both'),
  (2, 'CIS', 'both', 'both'),
  (3, 'ICA', 'names-only', 'ticker-only'),
  (4, 'CIS', 'both', 'both'),
  (5, 'NCC', 'natural-ids-only', 'name-only'),
  (6, 'AIC', 'both', 'ticker-only'),
  (7, 'CIS', 'names-only', 'both'),
  (8, 'ICA', 'both', 'both'),
  (9, 'CIS', 'both', 'name-only'),
  (10, 'NCC', 'natural-ids-only', 'both'),
  (11, 'CIS', 'both', 'both'),
  (12, 'AIC', 'names-only', 'ticker-only'),
  (13, 'CIS', 'both', 'both'),
  (14, 'ICA', 'both', 'name-only'),
  (15, 'CIS', 'names-only', 'both'),
  (16, 'NCC', 'both', 'both'),
  (17, 'CIS', 'both', 'ticker-only'),
  (18, 'AIC', 'natural-ids-only', 'both'),
  (19, 'CIS', 'both', 'both'),
  (20, 'ICA', 'names-only', 'name-only'),
  (21, 'CIS', 'both', 'both');

-- ==================== USER ROLES ====================
-- Admin user (full access)
INSERT INTO user_roles (user_id, role_id) VALUES
  (1, 'administrator');  -- admin - Full admin

-- Leads (can do everything members can + partner orders)
INSERT INTO user_roles (user_id, role_id) VALUES
  (2, 'lead'),      -- Alice - Lead
  (3, 'lead'),      -- Bob - Lead
  (4, 'lead');      -- Charlie - Lead + Admin

-- Administrator (Charlie also has admin role)
INSERT INTO user_roles (user_id, role_id) VALUES
  (4, 'administrator');

-- Members (regular members)
INSERT INTO user_roles (user_id, role_id) VALUES
  (5, 'member'),    -- Diana
  (6, 'member'),    -- Ethan
  (7, 'member'),    -- Fiona
  (8, 'member'),    -- George
  (9, 'member'),    -- Hannah
  (10, 'member'),   -- Ivan
  (11, 'member');   -- Julia

-- Applicants (awaiting approval, limited access)
INSERT INTO user_roles (user_id, role_id) VALUES
  (12, 'applicant'), -- Kevin
  (13, 'applicant'), -- Luna
  (14, 'applicant'); -- Mike

-- Trade Partners (external partners, partner orders only)
INSERT INTO user_roles (user_id, role_id) VALUES
  (15, 'trade-partner'), -- Nora
  (16, 'trade-partner'), -- Oscar
  (17, 'trade-partner'), -- Petra
  (18, 'trade-partner'); -- Quinn

-- Unverified (new registrations awaiting any role)
INSERT INTO user_roles (user_id, role_id) VALUES
  (19, 'unverified'), -- Rachel
  (20, 'unverified'), -- Steve
  (21, 'unverified'); -- Tara

-- ==================== FIO USER STORAGE ====================
-- Various storage types: STORE (base), WAREHOUSE_STORE (CX warehouse), SHIP_STORE (ship)
-- Using valid locations: Stations (ANT, ARC, BEN, HRT, HUB, MOR) and planets (KW-688c, KW-602a, ZV-194f, LS-300a, ZV-759i)
INSERT INTO fio_user_storage (id, user_id, storage_id, location_id, type) VALUES
  -- Alice (Lead) - multiple locations
  (1, 2, 'grouphub-BEN-WAREHOUSE_STORE', 'BEN', 'WAREHOUSE_STORE'),
  (2, 2, 'grouphub-MOR-WAREHOUSE_STORE', 'MOR', 'WAREHOUSE_STORE'),
  (3, 2, 'grouphub-KW-602a-STORE', 'KW-602a', 'STORE'),
  -- Bob (Lead) - base and warehouse
  (4, 3, 'grouphub-ANT-WAREHOUSE_STORE', 'ANT', 'WAREHOUSE_STORE'),
  (5, 3, 'grouphub-KW-688c-STORE', 'KW-688c', 'STORE'),
  -- Charlie (Lead + Admin)
  (6, 4, 'grouphub-HUB-WAREHOUSE_STORE', 'HUB', 'WAREHOUSE_STORE'),
  (7, 4, 'grouphub-ZV-759i-STORE', 'ZV-759i', 'STORE'),
  -- Diana (Member)
  (8, 5, 'grouphub-BEN-WAREHOUSE_STORE', 'BEN', 'WAREHOUSE_STORE'),
  (9, 5, 'grouphub-ZV-194f-STORE', 'ZV-194f', 'STORE'),
  -- Ethan (Member)
  (10, 6, 'grouphub-MOR-WAREHOUSE_STORE', 'MOR', 'WAREHOUSE_STORE'),
  -- Fiona (Member)
  (11, 7, 'grouphub-ANT-WAREHOUSE_STORE', 'ANT', 'WAREHOUSE_STORE'),
  (12, 7, 'grouphub-LS-300a-STORE', 'LS-300a', 'STORE'),
  -- George (Member)
  (13, 8, 'grouphub-HRT-WAREHOUSE_STORE', 'HRT', 'WAREHOUSE_STORE'),
  -- Hannah (Member)
  (14, 9, 'grouphub-BEN-WAREHOUSE_STORE', 'BEN', 'WAREHOUSE_STORE'),
  -- Ivan (Member)
  (15, 10, 'grouphub-ARC-WAREHOUSE_STORE', 'ARC', 'WAREHOUSE_STORE'),
  -- Julia (Member)
  (16, 11, 'grouphub-MOR-WAREHOUSE_STORE', 'MOR', 'WAREHOUSE_STORE'),
  -- Nora (Trade Partner)
  (17, 15, 'grouphub-BEN-WAREHOUSE_STORE', 'BEN', 'WAREHOUSE_STORE'),
  -- Oscar (Trade Partner)
  (18, 16, 'grouphub-ANT-WAREHOUSE_STORE', 'ANT', 'WAREHOUSE_STORE');

SELECT setval(pg_get_serial_sequence('fio_user_storage', 'id'), 18, true);

-- ==================== FIO INVENTORY ====================
-- Realistic inventory items across various commodities
INSERT INTO fio_inventory (user_storage_id, commodity_ticker, quantity) VALUES
  -- Alice's inventory (BEN warehouse)
  (1, 'H2O', 5000),
  (1, 'RAT', 2500),
  (1, 'DW', 1800),
  (1, 'OVE', 500),
  (1, 'COF', 300),
  -- Alice's inventory (MOR warehouse)
  (2, 'FE', 8000),
  (2, 'AL', 6000),
  (2, 'SI', 4500),
  (2, 'C', 3000),
  -- Alice's base (KW-602a)
  (3, 'PE', 2000),
  (3, 'PG', 1500),
  (3, 'EPO', 800),
  -- Bob's inventory (ANT warehouse)
  (4, 'LST', 10000),
  (4, 'MCG', 5000),
  (4, 'GL', 2000),
  (4, 'RCO', 1000),
  -- Bob's base (KW-688c)
  (5, 'HE', 3000),
  (5, 'NE', 1500),
  (5, 'AR', 2000),
  -- Charlie's inventory (HUB warehouse)
  (6, 'AU', 500),
  (6, 'AUO', 2000),
  (6, 'CU', 8000),
  (6, 'TI', 3000),
  -- Charlie's base (ZV-759i)
  (7, 'O', 15000),
  (7, 'N', 8000),
  (7, 'H', 12000),
  -- Diana's inventory (BEN warehouse and ZV-194f base)
  (8, 'COT', 4000),
  (8, 'NL', 2500),
  (8, 'GRN', 6000),
  (9, 'HCP', 1200),
  (9, 'HMS', 800),
  -- Ethan's inventory
  (10, 'FLX', 3500),
  (10, 'OFF', 1500),
  (10, 'PWO', 2000),
  -- Fiona's inventory (ANT warehouse and LS-300a base)
  (11, 'BSE', 4000),
  (11, 'BBH', 2500),
  (11, 'BDE', 1800),
  (12, 'HE3', 500),
  (12, 'AMM', 3000),
  -- George's inventory
  (13, 'MFK', 2000),
  (13, 'MFL', 1500),
  (13, 'MFE', 800),
  -- Hannah's inventory
  (14, 'TCL', 1000),
  (14, 'RSE', 1500),
  (14, 'ALO', 2500),
  -- Ivan's inventory
  (15, 'SOI', 8000),
  (15, 'HOP', 3000),
  (15, 'MAI', 4000),
  -- Julia's inventory
  (16, 'RG', 1200),
  (16, 'BL', 2000),
  (16, 'GL', 3500),
  -- Nora's inventory (Trade Partner)
  (17, 'FE', 10000),
  (17, 'AL', 8000),
  (17, 'LST', 15000),
  -- Oscar's inventory (Trade Partner)
  (18, 'PE', 5000),
  (18, 'PG', 4000),
  (18, 'RAT', 6000);

-- ==================== SELL ORDERS (100 orders) ====================
INSERT INTO sell_orders (id, user_id, commodity_ticker, location_id, price, currency, order_type, limit_mode, limit_quantity) VALUES
  -- Alice's sell orders (Lead)
  (1, 2, 'H2O', 'BEN', 50.00, 'CIS', 'internal', 'max_sell', 2000),
  (2, 2, 'RAT', 'BEN', 95.00, 'CIS', 'internal', 'none', NULL),
  (3, 2, 'DW', 'BEN', 120.50, 'CIS', 'internal', 'reserve', 500),
  (4, 2, 'FE', 'MOR', 85.00, 'ICA', 'internal', 'none', NULL),
  (5, 2, 'AL', 'MOR', 220.00, 'CIS', 'partner', 'none', NULL),
  (6, 2, 'SI', 'MOR', 180.00, 'CIS', 'internal', 'max_sell', 3000),
  -- Bob's sell orders (Lead)
  (7, 3, 'LST', 'ANT', 35.00, 'NCC', 'internal', 'none', NULL),
  (8, 3, 'MCG', 'ANT', 420.00, 'CIS', 'internal', 'reserve', 1000),
  (9, 3, 'GL', 'ANT', 95.00, 'CIS', 'partner', 'none', NULL),
  (10, 3, 'HE', 'KW-688c', 150.00, 'ICA', 'internal', 'none', NULL),
  (11, 3, 'NE', 'KW-688c', 280.00, 'CIS', 'internal', 'max_sell', 1000),
  -- Charlie's sell orders (Lead + Admin)
  (12, 4, 'AU', 'HUB', 8500.00, 'CIS', 'internal', 'reserve', 200),
  (13, 4, 'AUO', 'HUB', 1200.00, 'AIC', 'partner', 'none', NULL),
  (14, 4, 'CU', 'HUB', 450.00, 'CIS', 'internal', 'none', NULL),
  (15, 4, 'TI', 'HUB', 3200.00, 'CIS', 'internal', 'max_sell', 2000),
  (16, 4, 'O', 'ZV-759i', 25.00, 'NCC', 'internal', 'none', NULL),
  (17, 4, 'N', 'ZV-759i', 32.00, 'CIS', 'internal', 'none', NULL),
  -- Diana's sell orders (Member)
  (18, 5, 'COT', 'BEN', 78.00, 'CIS', 'internal', 'none', NULL),
  (19, 5, 'NL', 'BEN', 145.00, 'ICA', 'internal', 'reserve', 1000),
  (20, 5, 'GRN', 'BEN', 42.00, 'CIS', 'internal', 'none', NULL),
  (21, 5, 'HCP', 'ZV-194f', 850.00, 'CIS', 'internal', 'max_sell', 800),
  -- Ethan's sell orders (Member)
  (22, 6, 'FLX', 'MOR', 65.00, 'CIS', 'internal', 'none', NULL),
  (23, 6, 'OFF', 'MOR', 380.00, 'AIC', 'internal', 'none', NULL),
  (24, 6, 'PWO', 'MOR', 195.00, 'CIS', 'internal', 'reserve', 500),
  -- Fiona's sell orders (Member)
  (25, 7, 'BSE', 'ANT', 125.00, 'CIS', 'internal', 'none', NULL),
  (26, 7, 'BBH', 'ANT', 340.00, 'NCC', 'internal', 'max_sell', 1500),
  (27, 7, 'BDE', 'ANT', 280.00, 'CIS', 'internal', 'none', NULL),
  (28, 7, 'HE3', 'LS-300a', 4500.00, 'CIS', 'internal', 'reserve', 200),
  (29, 7, 'AMM', 'LS-300a', 55.00, 'ICA', 'internal', 'none', NULL),
  -- George's sell orders (Member)
  (30, 8, 'MFK', 'HRT', 520.00, 'CIS', 'internal', 'none', NULL),
  (31, 8, 'MFL', 'HRT', 680.00, 'CIS', 'internal', 'max_sell', 1000),
  (32, 8, 'MFE', 'HRT', 890.00, 'AIC', 'internal', 'none', NULL),
  -- Hannah's sell orders (Member)
  (33, 9, 'TCL', 'BEN', 750.00, 'CIS', 'internal', 'reserve', 500),
  (34, 9, 'RSE', 'BEN', 420.00, 'NCC', 'internal', 'none', NULL),
  (35, 9, 'ALO', 'BEN', 95.00, 'CIS', 'internal', 'none', NULL),
  -- Ivan's sell orders (Member)
  (36, 10, 'SOI', 'ARC', 38.00, 'CIS', 'internal', 'none', NULL),
  (37, 10, 'HOP', 'ARC', 125.00, 'ICA', 'internal', 'max_sell', 2000),
  (38, 10, 'MAI', 'ARC', 85.00, 'CIS', 'internal', 'none', NULL),
  -- Julia's sell orders (Member)
  (39, 11, 'RG', 'MOR', 1850.00, 'CIS', 'internal', 'reserve', 400),
  (40, 11, 'BL', 'MOR', 480.00, 'CIS', 'internal', 'none', NULL),
  (41, 11, 'GL', 'MOR', 92.00, 'AIC', 'internal', 'none', NULL),
  -- Nora's sell orders (Trade Partner - partner orders only)
  (42, 15, 'FE', 'BEN', 82.00, 'CIS', 'partner', 'none', NULL),
  (43, 15, 'AL', 'BEN', 215.00, 'NCC', 'partner', 'max_sell', 5000),
  (44, 15, 'LST', 'BEN', 32.00, 'CIS', 'partner', 'none', NULL),
  -- Oscar's sell orders (Trade Partner)
  (45, 16, 'PE', 'ANT', 650.00, 'CIS', 'partner', 'reserve', 2000),
  (46, 16, 'PG', 'ANT', 420.00, 'ICA', 'partner', 'none', NULL),
  (47, 16, 'RAT', 'ANT', 92.00, 'CIS', 'partner', 'none', NULL),
  -- Petra's sell orders (Trade Partner - no inventory, created from market)
  (48, 17, 'H2O', 'HUB', 48.00, 'CIS', 'partner', 'none', NULL),
  (49, 17, 'DW', 'HUB', 118.00, 'AIC', 'partner', 'max_sell', 1000),
  (50, 17, 'OVE', 'HUB', 185.00, 'CIS', 'partner', 'none', NULL),
  -- Quinn's sell orders (Trade Partner)
  (51, 18, 'C', 'MOR', 75.00, 'CIS', 'partner', 'none', NULL),
  (52, 18, 'FE', 'MOR', 88.00, 'NCC', 'partner', 'reserve', 3000),
  -- Additional sell orders to reach ~100
  (53, 2, 'OVE', 'BEN', 190.00, 'AIC', 'internal', 'none', NULL),
  (54, 2, 'COF', 'BEN', 380.00, 'CIS', 'partner', 'max_sell', 200),
  (55, 3, 'RCO', 'ANT', 2200.00, 'CIS', 'internal', 'none', NULL),
  (56, 3, 'AR', 'KW-688c', 125.00, 'ICA', 'internal', 'none', NULL),
  (57, 4, 'H', 'ZV-759i', 18.00, 'CIS', 'internal', 'none', NULL),
  (58, 5, 'HMS', 'ZV-194f', 650.00, 'NCC', 'internal', 'reserve', 400),
  (59, 6, 'H2O', 'MOR', 52.00, 'CIS', 'internal', 'none', NULL),
  (60, 7, 'RAT', 'ANT', 98.00, 'CIS', 'internal', 'none', NULL),
  (61, 8, 'FE', 'HRT', 80.00, 'AIC', 'internal', 'max_sell', 5000),
  (62, 9, 'AL', 'BEN', 225.00, 'CIS', 'internal', 'none', NULL),
  (63, 10, 'C', 'ARC', 72.00, 'ICA', 'internal', 'none', NULL),
  (64, 11, 'LST', 'MOR', 34.00, 'CIS', 'internal', 'reserve', 2000),
  (65, 2, 'PE', 'KW-602a', 680.00, 'CIS', 'internal', 'none', NULL),
  (66, 2, 'PG', 'KW-602a', 440.00, 'NCC', 'partner', 'none', NULL),
  (67, 2, 'EPO', 'KW-602a', 1250.00, 'CIS', 'internal', 'max_sell', 500),
  (68, 3, 'H2O', 'ANT', 49.00, 'CIS', 'internal', 'none', NULL),
  (69, 4, 'RAT', 'HUB', 94.00, 'AIC', 'internal', 'none', NULL),
  (70, 5, 'DW', 'ZV-194f', 125.00, 'CIS', 'internal', 'none', NULL),
  (71, 6, 'OVE', 'MOR', 188.00, 'CIS', 'internal', 'reserve', 300),
  (72, 7, 'COF', 'ANT', 395.00, 'ICA', 'internal', 'none', NULL),
  (73, 8, 'AL', 'HRT', 218.00, 'CIS', 'internal', 'none', NULL),
  (74, 9, 'SI', 'BEN', 175.00, 'NCC', 'internal', 'max_sell', 2500),
  (75, 10, 'CU', 'ARC', 445.00, 'CIS', 'internal', 'none', NULL),
  (76, 11, 'TI', 'MOR', 3150.00, 'CIS', 'internal', 'none', NULL),
  (77, 15, 'AU', 'BEN', 8200.00, 'AIC', 'partner', 'reserve', 100),
  (78, 16, 'AUO', 'ANT', 1150.00, 'CIS', 'partner', 'none', NULL),
  (79, 17, 'N', 'HUB', 30.00, 'CIS', 'partner', 'none', NULL),
  (80, 18, 'O', 'MOR', 24.00, 'ICA', 'partner', 'max_sell', 8000),
  (81, 2, 'C', 'MOR', 78.00, 'CIS', 'internal', 'none', NULL),
  (82, 3, 'SI', 'KW-688c', 182.00, 'CIS', 'internal', 'none', NULL),
  (83, 4, 'PE', 'ZV-759i', 695.00, 'NCC', 'internal', 'reserve', 1000),
  (84, 5, 'PG', 'BEN', 435.00, 'CIS', 'internal', 'none', NULL),
  (85, 6, 'AL', 'MOR', 228.00, 'AIC', 'internal', 'none', NULL),
  (86, 7, 'FE', 'LS-300a', 86.00, 'CIS', 'internal', 'max_sell', 4000),
  (87, 8, 'H2O', 'HRT', 51.00, 'CIS', 'internal', 'none', NULL),
  (88, 9, 'RAT', 'BEN', 96.00, 'ICA', 'internal', 'none', NULL),
  (89, 10, 'DW', 'ARC', 122.00, 'CIS', 'internal', 'reserve', 600),
  (90, 11, 'OVE', 'MOR', 192.00, 'CIS', 'internal', 'none', NULL),
  (91, 2, 'HE', 'BEN', 155.00, 'NCC', 'internal', 'none', NULL),
  (92, 3, 'NE', 'ANT', 285.00, 'CIS', 'internal', 'none', NULL),
  (93, 4, 'AR', 'HUB', 128.00, 'CIS', 'partner', 'max_sell', 1500),
  (94, 5, 'HE3', 'BEN', 4600.00, 'AIC', 'internal', 'none', NULL),
  (95, 6, 'AMM', 'MOR', 58.00, 'CIS', 'internal', 'none', NULL),
  (96, 7, 'H', 'ANT', 19.00, 'ICA', 'internal', 'reserve', 5000),
  (97, 8, 'N', 'HRT', 33.00, 'CIS', 'internal', 'none', NULL),
  (98, 9, 'O', 'BEN', 26.00, 'CIS', 'internal', 'none', NULL),
  (99, 10, 'BSE', 'ARC', 128.00, 'NCC', 'internal', 'max_sell', 2500),
  (100, 11, 'BBH', 'MOR', 348.00, 'CIS', 'internal', 'none', NULL);

SELECT setval(pg_get_serial_sequence('sell_orders', 'id'), 100, true);

-- ==================== BUY ORDERS (100 orders) ====================
INSERT INTO buy_orders (id, user_id, commodity_ticker, location_id, quantity, price, currency, order_type) VALUES
  -- Alice's buy orders (Lead)
  (1, 2, 'FE', 'BEN', 5000, 78.00, 'CIS', 'internal'),
  (2, 2, 'AL', 'BEN', 3000, 210.00, 'ICA', 'internal'),
  (3, 2, 'LST', 'MOR', 10000, 30.00, 'CIS', 'internal'),
  (4, 2, 'MCG', 'MOR', 2000, 400.00, 'NCC', 'partner'),
  -- Bob's buy orders (Lead)
  (5, 3, 'H2O', 'ANT', 8000, 45.00, 'CIS', 'internal'),
  (6, 3, 'RAT', 'ANT', 4000, 88.00, 'CIS', 'internal'),
  (7, 3, 'DW', 'KW-688c', 2000, 110.00, 'AIC', 'internal'),
  (8, 3, 'OVE', 'KW-688c', 1000, 175.00, 'CIS', 'partner'),
  -- Charlie's buy orders (Lead + Admin)
  (9, 4, 'PE', 'HUB', 3000, 620.00, 'CIS', 'internal'),
  (10, 4, 'PG', 'HUB', 2500, 400.00, 'ICA', 'internal'),
  (11, 4, 'EPO', 'ZV-759i', 1000, 1150.00, 'CIS', 'internal'),
  (12, 4, 'FLX', 'ZV-759i', 2000, 58.00, 'NCC', 'partner'),
  -- Diana's buy orders (Member)
  (13, 5, 'C', 'BEN', 5000, 68.00, 'CIS', 'internal'),
  (14, 5, 'SI', 'BEN', 3000, 165.00, 'CIS', 'internal'),
  (15, 5, 'CU', 'ZV-194f', 2000, 420.00, 'AIC', 'internal'),
  -- Ethan's buy orders (Member)
  (16, 6, 'TI', 'MOR', 1000, 3000.00, 'CIS', 'internal'),
  (17, 6, 'AU', 'MOR', 200, 8000.00, 'ICA', 'internal'),
  (18, 6, 'AUO', 'MOR', 1500, 1100.00, 'CIS', 'internal'),
  -- Fiona's buy orders (Member)
  (19, 7, 'H', 'ANT', 10000, 15.00, 'CIS', 'internal'),
  (20, 7, 'N', 'ANT', 5000, 28.00, 'NCC', 'internal'),
  (21, 7, 'O', 'LS-300a', 8000, 22.00, 'CIS', 'internal'),
  -- George's buy orders (Member)
  (22, 8, 'HE', 'HRT', 2000, 140.00, 'CIS', 'internal'),
  (23, 8, 'NE', 'HRT', 1000, 265.00, 'AIC', 'internal'),
  (24, 8, 'AR', 'HRT', 1500, 115.00, 'CIS', 'internal'),
  -- Hannah's buy orders (Member)
  (25, 9, 'COT', 'BEN', 3000, 72.00, 'CIS', 'internal'),
  (26, 9, 'NL', 'BEN', 2000, 135.00, 'ICA', 'internal'),
  (27, 9, 'GRN', 'BEN', 5000, 38.00, 'CIS', 'internal'),
  -- Ivan's buy orders (Member)
  (28, 10, 'BSE', 'ARC', 2500, 118.00, 'CIS', 'internal'),
  (29, 10, 'BBH', 'ARC', 1500, 320.00, 'NCC', 'internal'),
  (30, 10, 'BDE', 'ARC', 1000, 260.00, 'CIS', 'internal'),
  -- Julia's buy orders (Member)
  (31, 11, 'MFK', 'MOR', 1000, 480.00, 'CIS', 'internal'),
  (32, 11, 'MFL', 'MOR', 800, 640.00, 'AIC', 'internal'),
  (33, 11, 'MFE', 'MOR', 500, 850.00, 'CIS', 'internal'),
  -- Nora's buy orders (Trade Partner)
  (34, 15, 'H2O', 'BEN', 10000, 42.00, 'CIS', 'partner'),
  (35, 15, 'RAT', 'BEN', 5000, 85.00, 'ICA', 'partner'),
  (36, 15, 'DW', 'BEN', 3000, 105.00, 'CIS', 'partner'),
  -- Oscar's buy orders (Trade Partner)
  (37, 16, 'C', 'ANT', 8000, 65.00, 'NCC', 'partner'),
  (38, 16, 'FE', 'ANT', 6000, 75.00, 'CIS', 'partner'),
  (39, 16, 'AL', 'ANT', 4000, 200.00, 'CIS', 'partner'),
  -- Petra's buy orders (Trade Partner)
  (40, 17, 'SI', 'HUB', 5000, 160.00, 'CIS', 'partner'),
  (41, 17, 'CU', 'HUB', 3000, 410.00, 'AIC', 'partner'),
  (42, 17, 'TI', 'HUB', 1000, 2950.00, 'CIS', 'partner'),
  -- Quinn's buy orders (Trade Partner)
  (43, 18, 'PE', 'MOR', 2000, 600.00, 'CIS', 'partner'),
  (44, 18, 'PG', 'MOR', 1500, 380.00, 'ICA', 'partner'),
  (45, 18, 'EPO', 'MOR', 800, 1100.00, 'CIS', 'partner'),
  -- Additional buy orders to reach ~100
  (46, 2, 'COF', 'BEN', 500, 360.00, 'CIS', 'internal'),
  (47, 2, 'TCL', 'MOR', 800, 700.00, 'NCC', 'internal'),
  (48, 3, 'RSE', 'ANT', 1200, 390.00, 'CIS', 'internal'),
  (49, 3, 'ALO', 'KW-688c', 2000, 88.00, 'AIC', 'partner'),
  (50, 4, 'SOI', 'HUB', 6000, 35.00, 'CIS', 'internal'),
  (51, 4, 'HOP', 'ZV-759i', 2500, 115.00, 'CIS', 'internal'),
  (52, 5, 'MAI', 'BEN', 3000, 78.00, 'ICA', 'internal'),
  (53, 5, 'RG', 'ZV-194f', 600, 1750.00, 'CIS', 'internal'),
  (54, 6, 'BL', 'MOR', 1500, 450.00, 'CIS', 'internal'),
  (55, 6, 'GL', 'MOR', 2500, 85.00, 'NCC', 'internal'),
  (56, 7, 'RCO', 'ANT', 800, 2050.00, 'CIS', 'internal'),
  (57, 7, 'HE3', 'LS-300a', 300, 4200.00, 'AIC', 'internal'),
  (58, 8, 'AMM', 'HRT', 2500, 50.00, 'CIS', 'internal'),
  (59, 8, 'HCP', 'HRT', 600, 800.00, 'CIS', 'internal'),
  (60, 9, 'HMS', 'BEN', 500, 600.00, 'ICA', 'internal'),
  (61, 9, 'OFF', 'BEN', 1000, 350.00, 'CIS', 'internal'),
  (62, 10, 'PWO', 'ARC', 1500, 180.00, 'NCC', 'internal'),
  (63, 10, 'FLX', 'ARC', 2500, 55.00, 'CIS', 'internal'),
  (64, 11, 'H2O', 'MOR', 6000, 44.00, 'CIS', 'internal'),
  (65, 11, 'RAT', 'MOR', 3000, 86.00, 'AIC', 'internal'),
  (66, 15, 'OVE', 'BEN', 1000, 170.00, 'CIS', 'partner'),
  (67, 15, 'COF', 'BEN', 300, 350.00, 'ICA', 'partner'),
  (68, 16, 'HE', 'ANT', 1500, 135.00, 'CIS', 'partner'),
  (69, 16, 'NE', 'ANT', 800, 255.00, 'NCC', 'partner'),
  (70, 17, 'AR', 'HUB', 2000, 110.00, 'CIS', 'partner'),
  (71, 17, 'H', 'HUB', 12000, 14.00, 'CIS', 'partner'),
  (72, 18, 'N', 'MOR', 6000, 26.00, 'AIC', 'partner'),
  (73, 18, 'O', 'MOR', 10000, 20.00, 'CIS', 'partner'),
  (74, 2, 'HE3', 'BEN', 400, 4100.00, 'CIS', 'internal'),
  (75, 2, 'AMM', 'MOR', 3000, 48.00, 'ICA', 'internal'),
  (76, 3, 'BSE', 'ANT', 2000, 112.00, 'CIS', 'internal'),
  (77, 3, 'BBH', 'KW-688c', 1200, 310.00, 'NCC', 'partner'),
  (78, 4, 'BDE', 'HUB', 900, 250.00, 'CIS', 'internal'),
  (79, 4, 'MFK', 'ZV-759i', 700, 460.00, 'CIS', 'internal'),
  (80, 5, 'MFL', 'BEN', 500, 620.00, 'AIC', 'internal'),
  (81, 5, 'MFE', 'ZV-194f', 400, 820.00, 'CIS', 'internal'),
  (82, 6, 'TCL', 'MOR', 600, 680.00, 'CIS', 'internal'),
  (83, 6, 'RSE', 'MOR', 900, 380.00, 'ICA', 'internal'),
  (84, 7, 'ALO', 'ANT', 1800, 82.00, 'CIS', 'internal'),
  (85, 7, 'SOI', 'LS-300a', 5000, 32.00, 'NCC', 'internal'),
  (86, 8, 'HOP', 'HRT', 2000, 110.00, 'CIS', 'internal'),
  (87, 8, 'MAI', 'HRT', 2500, 72.00, 'CIS', 'internal'),
  (88, 9, 'RG', 'BEN', 400, 1700.00, 'AIC', 'internal'),
  (89, 9, 'BL', 'BEN', 1000, 430.00, 'CIS', 'internal'),
  (90, 10, 'GL', 'ARC', 2000, 80.00, 'CIS', 'internal'),
  (91, 10, 'RCO', 'ARC', 500, 1980.00, 'ICA', 'internal'),
  (92, 11, 'HE3', 'MOR', 350, 4050.00, 'CIS', 'internal'),
  (93, 11, 'AMM', 'MOR', 2200, 46.00, 'NCC', 'internal'),
  (94, 15, 'PE', 'BEN', 1500, 580.00, 'CIS', 'partner'),
  (95, 15, 'PG', 'BEN', 1000, 360.00, 'CIS', 'partner'),
  (96, 16, 'EPO', 'ANT', 600, 1050.00, 'AIC', 'partner'),
  (97, 16, 'FLX', 'ANT', 2000, 52.00, 'CIS', 'partner'),
  (98, 17, 'AU', 'HUB', 150, 7800.00, 'ICA', 'partner'),
  (99, 17, 'AUO', 'HUB', 1200, 1050.00, 'CIS', 'partner'),
  (100, 18, 'LST', 'MOR', 8000, 28.00, 'CIS', 'partner');

SELECT setval(pg_get_serial_sequence('buy_orders', 'id'), 100, true);

-- ==================== ORDER RESERVATIONS ====================
-- Create various reservations linking buy and sell orders
-- counterparty_user_id is the user making the reservation (buyer reserving from sell order)
INSERT INTO order_reservations (id, buy_order_id, sell_order_id, counterparty_user_id, quantity, status, notes, expires_at) VALUES
  -- Pending reservations
  (1, 1, 4, 3, 1500, 'pending', 'Urgent need for production', NOW() + INTERVAL '7 days'),
  (2, 5, 1, 5, 2000, 'pending', NULL, NOW() + INTERVAL '5 days'),
  (3, 13, 81, 6, 1500, 'pending', 'Monthly restocking', NOW() + INTERVAL '14 days'),
  (4, 34, 42, 7, 3000, 'pending', 'Partner deal', NOW() + INTERVAL '10 days'),
  (5, 16, 76, 8, 500, 'pending', NULL, NOW() + INTERVAL '3 days'),
  -- Confirmed reservations
  (6, 6, 2, 4, 1000, 'confirmed', 'Confirmed, will deliver next week', NULL),
  (7, 9, 65, 9, 800, 'confirmed', NULL, NULL),
  (8, 22, 10, 10, 500, 'confirmed', 'Waiting for pickup', NULL),
  (9, 37, 51, 11, 2000, 'confirmed', 'Partner confirmed', NULL),
  (10, 25, 18, 12, 1500, 'confirmed', NULL, NULL),
  -- Fulfilled reservations (completed trades)
  (11, 19, 96, 13, 3000, 'fulfilled', 'Trade completed successfully', NULL),
  (12, 28, 99, 14, 1000, 'fulfilled', NULL, NULL),
  (13, 31, 30, 15, 400, 'fulfilled', 'Great trade!', NULL),
  (14, 46, 54, 16, 200, 'fulfilled', NULL, NULL),
  (15, 50, 36, 17, 2000, 'fulfilled', 'Bulk deal completed', NULL),
  -- Rejected reservations
  (16, 17, 12, 18, 100, 'rejected', 'Price too low', NULL),
  (17, 41, 14, 19, 500, 'rejected', 'Not available anymore', NULL),
  (18, 64, 59, 20, 1500, 'rejected', NULL, NULL),
  -- Cancelled reservations
  (19, 7, 3, 5, 800, 'cancelled', 'Changed my mind', NULL),
  (20, 26, 19, 6, 600, 'cancelled', 'Found better deal', NULL),
  (21, 54, 39, 7, 200, 'cancelled', NULL, NULL),
  -- Expired reservations
  (22, 3, 7, 8, 2000, 'expired', NULL, NOW() - INTERVAL '2 days'),
  (23, 14, 6, 9, 1000, 'expired', 'Never confirmed', NOW() - INTERVAL '5 days'),
  (24, 40, 79, 10, 1500, 'expired', NULL, NOW() - INTERVAL '1 day'),
  -- More pending for active trading
  (25, 2, 5, 11, 1500, 'pending', NULL, NOW() + INTERVAL '6 days'),
  (26, 10, 66, 12, 1000, 'pending', 'Need for new project', NOW() + INTERVAL '8 days'),
  (27, 35, 47, 13, 2000, 'pending', NULL, NOW() + INTERVAL '4 days'),
  (28, 43, 52, 14, 800, 'pending', 'Partner request', NOW() + INTERVAL '12 days'),
  (29, 55, 41, 15, 1000, 'pending', NULL, NOW() + INTERVAL '9 days'),
  (30, 74, 28, 16, 150, 'pending', 'Rare materials needed', NOW() + INTERVAL '7 days');

SELECT setval(pg_get_serial_sequence('order_reservations', 'id'), 30, true);

-- ==================== NOTIFICATIONS ====================
-- Sample notifications for various events
INSERT INTO notifications (user_id, type, title, message, data, is_read) VALUES
  -- Reservation notifications for sellers
  (2, 'reservation_placed', 'New Reservation', 'Bob reserved 1500 FE from your order', '{"sellOrderId": 4, "buyOrderId": 1, "reservationId": 1, "quantity": 1500}', false),
  (2, 'reservation_placed', 'New Reservation', 'Bob reserved 2000 H2O from your order', '{"sellOrderId": 1, "buyOrderId": 5, "reservationId": 2, "quantity": 2000}', false),
  (4, 'reservation_placed', 'New Reservation', 'Diana reserved 1500 C from your order', '{"sellOrderId": 81, "buyOrderId": 13, "reservationId": 3, "quantity": 1500}', true),
  -- Reservation notifications for buyers
  (3, 'reservation_confirmed', 'Reservation Confirmed', 'Alice confirmed your reservation for 1000 RAT', '{"sellOrderId": 2, "buyOrderId": 6, "reservationId": 6, "quantity": 1000}', true),
  (4, 'reservation_confirmed', 'Reservation Confirmed', 'Your PE reservation was confirmed', '{"sellOrderId": 65, "buyOrderId": 9, "reservationId": 7, "quantity": 800}', false),
  -- Fulfilled notifications
  (7, 'reservation_fulfilled', 'Trade Completed', 'Your reservation for 3000 H has been fulfilled', '{"sellOrderId": 96, "buyOrderId": 19, "reservationId": 11, "quantity": 3000}', true),
  (10, 'reservation_fulfilled', 'Trade Completed', 'Your BSE trade is complete', '{"sellOrderId": 99, "buyOrderId": 28, "reservationId": 12, "quantity": 1000}', true),
  -- Rejected notifications
  (6, 'reservation_rejected', 'Reservation Rejected', 'Your AU reservation was rejected: Price too low', '{"sellOrderId": 12, "buyOrderId": 17, "reservationId": 16, "quantity": 100}', true),
  (17, 'reservation_rejected', 'Reservation Rejected', 'CU reservation rejected', '{"sellOrderId": 14, "buyOrderId": 41, "reservationId": 17, "quantity": 500}', false),
  -- User approval notifications
  (12, 'user_approved', 'Application Approved', 'Your application to join Kawakawa has been approved!', '{"roles": ["applicant"]}', true),
  (13, 'user_approved', 'Application Approved', 'Welcome to Kawakawa!', '{"roles": ["applicant"]}', false),
  -- Admin notifications about pending approvals
  (4, 'user_needs_approval', 'New Registration', 'Rachel Torres needs approval', '{"userId": 19, "username": "rachel"}', false),
  (4, 'user_needs_approval', 'New Registration', 'Steve Upton needs approval', '{"userId": 20, "username": "steve"}', false),
  (4, 'user_needs_approval', 'New Registration', 'Tara Vance needs approval', '{"userId": 21, "username": "tara"}', true);

-- ==================== TEST PRICE LIST ====================
-- Custom price list for testing purposes
INSERT INTO price_lists (code, name, description, type, currency, default_location_id, is_active) VALUES
  ('TEST', 'Test Price List', 'Custom price list for testing', 'custom', 'CIS', 'BEN', true);

-- ==================== TEST PRICES ====================
-- Sample prices for TEST price list
INSERT INTO prices (price_list_code, commodity_ticker, location_id, price, source, source_reference) VALUES
  ('TEST', 'H2O', 'BEN', '50.00', 'manual', 'Mock data'),
  ('TEST', 'RAT', 'BEN', '95.00', 'manual', 'Mock data'),
  ('TEST', 'DW', 'BEN', '120.00', 'manual', 'Mock data'),
  ('TEST', 'OVE', 'BEN', '185.00', 'manual', 'Mock data'),
  ('TEST', 'COF', 'BEN', '380.00', 'manual', 'Mock data'),
  ('TEST', 'FE', 'BEN', '85.00', 'manual', 'Mock data'),
  ('TEST', 'AL', 'BEN', '220.00', 'manual', 'Mock data'),
  ('TEST', 'SI', 'BEN', '175.00', 'manual', 'Mock data'),
  ('TEST', 'C', 'BEN', '72.00', 'manual', 'Mock data'),
  ('TEST', 'PE', 'BEN', '650.00', 'manual', 'Mock data'),
  ('TEST', 'PG', 'BEN', '420.00', 'manual', 'Mock data'),
  ('TEST', 'LST', 'BEN', '35.00', 'manual', 'Mock data'),
  ('TEST', 'MCG', 'BEN', '420.00', 'manual', 'Mock data'),
  ('TEST', 'GL', 'BEN', '95.00', 'manual', 'Mock data'),
  ('TEST', 'CU', 'BEN', '450.00', 'manual', 'Mock data'),
  ('TEST', 'TI', 'BEN', '3200.00', 'manual', 'Mock data'),
  ('TEST', 'AU', 'BEN', '8500.00', 'manual', 'Mock data'),
  ('TEST', 'AUO', 'BEN', '1200.00', 'manual', 'Mock data'),
  ('TEST', 'O', 'BEN', '25.00', 'manual', 'Mock data'),
  ('TEST', 'N', 'BEN', '32.00', 'manual', 'Mock data');

-- ==================== TEST PRICE ADJUSTMENTS ====================
-- Sample adjustments for TEST price list
INSERT INTO price_adjustments (price_list_code, commodity_ticker, location_id, adjustment_type, adjustment_value, description, priority, is_active) VALUES
  ('TEST', NULL, NULL, 'percentage', '10.00', 'Global 10% markup for TEST', 0, true),
  ('TEST', 'AU', NULL, 'percentage', '5.00', 'Additional 5% for gold', 10, true),
  ('TEST', 'AUO', NULL, 'percentage', '5.00', 'Additional 5% for gold ore', 10, true);

-- Summary
SELECT 'Mock data loaded successfully!' as status;
SELECT 'Users: ' || COUNT(*) FROM users WHERE id > 1;
SELECT 'Sell Orders: ' || COUNT(*) FROM sell_orders;
SELECT 'Buy Orders: ' || COUNT(*) FROM buy_orders;
SELECT 'Reservations: ' || COUNT(*) FROM order_reservations;
SELECT 'Inventory Items: ' || COUNT(*) FROM fio_inventory;
SELECT 'Notifications: ' || COUNT(*) FROM notifications;
SELECT 'Test Prices: ' || COUNT(*) FROM prices WHERE price_list_code = 'TEST';
