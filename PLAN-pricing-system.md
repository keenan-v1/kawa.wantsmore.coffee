# Pricing System Implementation Plan

## Overview

This plan implements a comprehensive pricing system that supports both internal KAWA prices and FIO exchange prices, with **location-dependent** pricing and adjustable price modifiers.

### Core Concepts

1. **Exchange + Location Pricing**: Prices are keyed by `(exchange_code, commodity_ticker, location_id, currency)`. This allows KAWA and FIO exchanges to coexist at the same physical locations.
2. **Exchange Codes**: KAWA is our internal exchange. FIO exchanges are CI1, NC1, IC1, AI1, etc.
3. **Location-Dependent KAWA Prices**: KAWA prices vary by location (H2O at Proxion ≠ H2O at BEN).
4. **FIO Exchange Fixed Locations**: Each FIO exchange has a fixed station (CI1 is always at BEN).
5. **Adjustments**: Separate table for percentage or fixed-amount modifications by exchange and/or location.
6. **Final Price** = Base Price + Adjustments (applied in priority order)

### Key Design Decisions

- **Composite key (exchange_code + location_id)**: Distinguishes KAWA prices at BEN from CI1 prices at BEN.
- **KAWA as an exchange**: Treated like any other exchange, but with location-varying prices.
- **FIO exchange→location mapping**: fio_exchanges table maps CI1→BEN, NC1→MOR, etc.
- **Source tracking**: Separate from exchange_code - tracks HOW the price was entered (manual, csv_import, google_sheets, fio_sync).
- **Layered adjustments**: Can target specific exchanges, locations, or both.

---

## Phase 1: Database Schema & Core API

### Database Changes

#### 1.1 New Enum: `price_source_enum`

```sql
CREATE TYPE price_source_enum AS ENUM ('manual', 'csv_import', 'google_sheets', 'fio_exchange');
```

#### 1.2 New Table: `price_lists`

Base price data keyed by exchange + commodity + location.

| Column           | Type                                    | Description                                           |
| ---------------- | --------------------------------------- | ----------------------------------------------------- |
| id               | SERIAL PK                               |                                                       |
| exchange_code    | VARCHAR(20) NOT NULL                    | KAWA, CI1, NC1, etc.                                  |
| commodity_ticker | VARCHAR(10) NOT NULL FK→fio_commodities |                                                       |
| location_id      | VARCHAR(20) NOT NULL FK→fio_locations   | Physical location (station or planet)                 |
| price            | DECIMAL(12,2) NOT NULL                  | Base price                                            |
| currency         | currency_enum NOT NULL                  | ICA, CIS, AIC, NCC                                    |
| source           | price_source_enum NOT NULL              | How this price was entered (manual, csv_import, etc.) |
| source_reference | TEXT                                    | Google Sheets URL, CSV filename, sync timestamp, etc. |
| updated_at       | TIMESTAMP                               | Last update time                                      |
| created_at       | TIMESTAMP                               |                                                       |

**Unique constraint**: `(exchange_code, commodity_ticker, location_id, currency)`

**Examples:**

- `KAWA, H2O, UV-351a, CIS, 10.00` - KAWA internal price for water at Proxion
- `KAWA, H2O, BEN, CIS, 15.00` - KAWA internal price for water at Benton
- `CI1, H2O, BEN, CIS, 12.50` - CI1 exchange price for water (always at BEN)

#### 1.3 New Enum: `adjustment_type_enum`

```sql
CREATE TYPE adjustment_type_enum AS ENUM ('percentage', 'fixed');
```

#### 1.4 New Table: `price_adjustments`

Exchange and/or location-specific price modifications.

| Column             | Type                           | Description                                       |
| ------------------ | ------------------------------ | ------------------------------------------------- |
| id                 | SERIAL PK                      |                                                   |
| exchange_code      | VARCHAR(20)                    | NULL = applies to all exchanges (KAWA, CI1, etc.) |
| commodity_ticker   | VARCHAR(10) FK→fio_commodities | NULL = applies to all commodities                 |
| location_id        | VARCHAR(20) FK→fio_locations   | NULL = applies to all locations                   |
| currency           | currency_enum                  | NULL = applies to all currencies                  |
| adjustment_type    | adjustment_type_enum NOT NULL  | percentage or fixed                               |
| adjustment_value   | DECIMAL(12,4) NOT NULL         | e.g., 5.00 for +5% or +5 units                    |
| priority           | INTEGER DEFAULT 0              | Order of application (lower = first)              |
| description        | TEXT                           | Human-readable explanation                        |
| is_active          | BOOLEAN DEFAULT true           | Enable/disable without deleting                   |
| effective_from     | TIMESTAMP                      | NULL = immediately effective                      |
| effective_until    | TIMESTAMP                      | NULL = no expiration                              |
| created_by_user_id | INTEGER FK→users               |                                                   |
| created_at         | TIMESTAMP                      |                                                   |
| updated_at         | TIMESTAMP                      |                                                   |

**Index**: `(exchange_code, location_id, commodity_ticker)` for efficient lookups

**Time-based filtering**: When calculating effective prices, only apply adjustments where:

- `is_active = true`
- `effective_from IS NULL OR effective_from <= NOW()`
- `effective_until IS NULL OR effective_until > NOW()`

**Examples:**

- Global 5% KAWA markup: `exchange='KAWA', ticker=NULL, location=NULL, type='percentage', value=5`
- All exchanges at BEN discount: `exchange=NULL, ticker=NULL, location='BEN', type='percentage', value=-2`
- H2O markup on KAWA only: `exchange='KAWA', ticker='H2O', location=NULL, type='fixed', value=10`
- CI1-specific fee: `exchange='CI1', ticker=NULL, location=NULL, type='fixed', value=25`

#### 1.5 New Table: `fio_exchanges`

Maps FIO exchange codes to their physical station locations.

| Column      | Type                                  | Description                        |
| ----------- | ------------------------------------- | ---------------------------------- |
| code        | VARCHAR(10) PK                        | CI1, NC1, IC1, AI1, etc.           |
| name        | VARCHAR(100) NOT NULL                 | "Commodity Exchange - Benton"      |
| location_id | VARCHAR(20) NOT NULL FK→fio_locations | BEN, MOR, ANT, HRT, etc.           |
| currency    | currency_enum NOT NULL                | Primary currency for this exchange |
| created_at  | TIMESTAMP                             |                                    |

**Seed data:**

- CI1 → BEN (CIS)
- NC1 → MOR (NCC)
- IC1 → ANT (ICA)
- AI1 → HRT (AIC)
- KAWA → NULL (CIS) - virtual exchange, no fixed location

#### 1.6 Settings Keys (for KAWA configuration)

Add to `settings` table:

- `kawa.default_currency` = 'CIS' (configurable)
- `fio.price_field` = 'PriceAverage' (which FIO price to sync)

### API Endpoints

#### 1.7 PriceListController

- `GET /prices` - List all prices (query filters: exchange, location, commodity, currency)
- `GET /prices/{exchange}` - Prices for specific exchange (KAWA, CI1, etc.)
- `GET /prices/{exchange}/{locationId}` - Prices for exchange at location
- `GET /prices/{exchange}/{locationId}/{ticker}` - Single commodity price
- `GET /prices/effective/{exchange}/{locationId}/{ticker}` - Price with adjustments applied
- `GET /prices/export/{exchange}` - Export base prices as CSV
- `GET /prices/export/{exchange}/effective` - Export effective prices (with adjustments) as CSV
- `POST /prices` - Create/update price (manual entry)
- `PUT /prices/{id}` - Update existing price
- `DELETE /prices/{id}` - Remove price entry

#### 1.7 PriceAdjustmentsController

- `GET /price-adjustments` - List all adjustments (query filters: exchange, location)
- `GET /price-adjustments/exchange/{exchange}` - Adjustments for exchange
- `GET /price-adjustments/location/{locationId}` - Adjustments affecting location
- `POST /price-adjustments` - Create adjustment
- `PUT /price-adjustments/{id}` - Update adjustment
- `DELETE /price-adjustments/{id}` - Remove adjustment

#### 1.8 FioExchangesController

- `GET /fio-exchanges` - List all FIO exchange mappings
- `GET /fio-exchanges/{code}` - Get specific exchange
- `POST /fio-exchanges` - Create exchange mapping (admin)
- `PUT /fio-exchanges/{code}` - Update exchange
- `DELETE /fio-exchanges/{code}` - Remove exchange

### Deliverables

- [ ] Database migration for new tables and enums
- [ ] Drizzle schema definitions with relations
- [ ] Seed data for fio_exchanges
- [ ] PriceListController with CRUD + tests
- [ ] PriceAdjustmentsController with CRUD + tests
- [ ] FioExchangesController with CRUD + tests
- [ ] Price calculation service (base + adjustments)
- [ ] New permissions in seed data

---

## Phase 2: CSV Import System

### Backend

#### 2.1 CSV Parsing Service

Create `apps/api/src/services/csv/parser.ts`:

- Parse CSV content with configurable delimiters (comma, semicolon, tab)
- Support both index-based and header-based field mapping
- Validate required fields (ticker, location, price)
- Handle various number formats (commas as thousands, periods as decimal)
- Return structured result with parsed rows + validation errors

#### 2.2 Field Mapping Types

```typescript
interface CsvFieldMapping {
  ticker: string | number // Header name or column index (0-based)
  location: string | number // Header name or column index
  price: string | number // Header name or column index
  currency?: string | number // Optional - defaults to user preference
}

interface CsvImportRequest {
  mapping: CsvFieldMapping
  locationDefault?: string // Default location if not in CSV
  currencyDefault?: Currency // Default currency if not in CSV
  delimiter?: string // Default: auto-detect
  hasHeader?: boolean // Default: true
}

interface CsvImportResult {
  imported: number // New prices created
  updated: number // Existing prices updated
  skipped: number // Rows skipped (validation errors)
  errors: CsvRowError[] // Details of validation failures
}
```

#### 2.3 Import Controller

`POST /prices/import/csv`:

- Accept multipart form data: CSV file + mapping JSON
- Validate mapping references valid columns
- Parse and validate all rows (ticker exists, location exists, price valid)
- Upsert prices (update if exists, insert if new)
- Return CsvImportResult

`POST /prices/import/csv/preview`:

- Same input as import
- Returns first 50 parsed rows without committing
- Shows detected headers, sample data, validation warnings
- Allows user to verify mapping before final import

### Frontend

#### 2.4 CSV Import Dialog Component

`apps/web/src/components/PriceImportDialog.vue`:

**Step 1: File Selection**

- Drag-and-drop zone or file picker
- Show file name and size after selection
- Auto-detect delimiter and headers

**Step 2: Column Mapping**

- Show preview of first 5 rows
- Dropdown for each required field: Ticker, Location, Price
- Optional: Currency column (or select default)
- Visual indicator of which columns are mapped

**Step 3: Preview & Validation**

- Table showing parsed data with validation status
- Highlight rows with errors (unknown ticker, invalid price, etc.)
- Summary: "Ready to import X prices, Y will be updated, Z skipped"

**Step 4: Import**

- Import button with confirmation
- Progress indicator
- Results summary with error details

### Deliverables

- [ ] CSV parser service with unit tests
- [ ] Import controller endpoints with tests
- [ ] Preview endpoint with validation
- [ ] PriceImportDialog.vue component
- [ ] Integration into PriceListView

---

## Phase 3: Google Sheets Integration

### Backend

#### 3.1 Google Sheets Service

Create `apps/api/src/services/google-sheets/client.ts`:

**URL Parsing:**

```typescript
// Supported formats:
// https://docs.google.com/spreadsheets/d/{ID}/edit#gid={SHEET_ID}
// https://docs.google.com/spreadsheets/d/{ID}/edit?gid={SHEET_ID}
// https://docs.google.com/spreadsheets/d/{ID}/

interface ParsedSheetsUrl {
  spreadsheetId: string
  sheetGid?: number
}
```

**Data Fetching:**

- For published sheets: Use CSV export URL
- For private sheets: Require Google API key in settings (future enhancement)
- `fetchSheetAsCsv(spreadsheetId, sheetGid?)` → returns CSV string

#### 3.2 Import Configuration Table

`price_import_configs`:

| Column              | Type                  | Description                             |
| ------------------- | --------------------- | --------------------------------------- |
| id                  | SERIAL PK             |                                         |
| name                | VARCHAR(100) NOT NULL | Configuration name                      |
| type                | VARCHAR(20) NOT NULL  | 'google_sheets'                         |
| url                 | TEXT NOT NULL         | Full Google Sheets URL                  |
| sheet_gid           | INTEGER               | Specific sheet tab (null = first sheet) |
| field_mapping       | JSONB NOT NULL        | CsvFieldMapping as JSON                 |
| location_default    | VARCHAR(20)           | Default location_id                     |
| currency_default    | currency_enum         | Default currency                        |
| auto_sync           | BOOLEAN DEFAULT false | Enable scheduled sync                   |
| sync_interval_hours | INTEGER DEFAULT 24    | Hours between syncs                     |
| last_synced_at      | TIMESTAMP             |                                         |
| last_sync_result    | JSONB                 | CsvImportResult as JSON                 |
| created_by_user_id  | INTEGER FK→users      |                                         |
| created_at          | TIMESTAMP             |                                         |
| updated_at          | TIMESTAMP             |                                         |

#### 3.3 Configuration Controller

- `GET /prices/import/configs` - List saved configurations
- `GET /prices/import/configs/{id}` - Get configuration details
- `POST /prices/import/configs` - Save new configuration
- `PUT /prices/import/configs/{id}` - Update configuration
- `DELETE /prices/import/configs/{id}` - Remove configuration
- `POST /prices/import/configs/{id}/sync` - Trigger manual sync
- `POST /prices/import/google-sheets` - One-time import (no saved config)

### Frontend

#### 3.4 Google Sheets Import Dialog

`apps/web/src/components/GoogleSheetsImportDialog.vue`:

- URL input with validation
- "Fetch Preview" button to load sheet data
- Same field mapping interface as CSV import
- Preview table with validation
- Options: Save as configuration, enable auto-sync
- Import button

#### 3.5 Import Configurations View

`apps/web/src/views/PriceImportConfigsView.vue`:

- Table of saved configurations
- Columns: Name, Type, URL, Last Sync, Auto-Sync Status
- Actions: Sync Now, Edit, Delete
- Add new configuration button

### Deliverables

- [ ] Google Sheets URL parser with tests
- [ ] Sheet fetcher service (public sheets)
- [ ] price_import_configs schema and migration
- [ ] Configuration CRUD controller with tests
- [ ] GoogleSheetsImportDialog.vue
- [ ] PriceImportConfigsView.vue
- [ ] Sync trigger functionality

---

## Phase 4: FIO Exchange Price Integration

### Backend

#### 4.1 FIO Exchange Prices Service

Create `apps/api/src/services/fio/sync-exchange-prices.ts`:

**Data Source**: FIO `/csv/prices` or `/exchange/all` endpoint

**Price Fields Available:**
| Field | Description | Notes |
|-------|-------------|-------|
| MMBuy | Market maker buy price | Usually most stable |
| MMSell | Market maker sell price | Usually most stable |
| PriceAverage | 30-day volume-weighted average | Good baseline |
| Ask | Lowest current ask | Can be volatile |
| Bid | Highest current bid | Can be volatile |

**Recommendation**: Use `PriceAverage` as default, make configurable.

#### 4.2 Sync Logic

```typescript
interface FioExchangeSyncResult {
  exchangeCode: string
  locationId: string
  pricesUpdated: number
  pricesSkipped: number // Unknown tickers
  syncedAt: Date
}

async function syncFioExchangePrices(
  exchangeCode?: string // null = sync all exchanges
): Promise<FioExchangeSyncResult[]>
```

**Process:**

1. Fetch price data from FIO API
2. For each exchange code, look up location_id from fio_exchanges table
3. Upsert into price_lists with source='fio_exchange', source_reference=exchangeCode
4. Track what was updated vs skipped

#### 4.3 Sync Controller

- `POST /prices/sync/fio` - Sync all FIO exchanges
- `POST /prices/sync/fio/{exchangeCode}` - Sync specific exchange
- `GET /prices/sync/fio/status` - Last sync times per exchange

#### 4.4 Price Field Configuration

Add to settings table:

- Key: `fio.price_field`
- Value: `'PriceAverage'` | `'MMBuy'` | `'MMSell'` | `'Ask'` | `'Bid'`

### Frontend

#### 4.5 FIO Sync UI

Add to PriceListView or dedicated section:

- "Sync FIO Prices" button
- Per-exchange sync status (last sync time, count)
- Settings: which price field to use

#### 4.6 CLI Integration

Add to `apps/api/src/scripts/fio-sync.ts` (or new file):

- `pnpm fio:sync:prices` - CLI command to sync FIO exchange prices
- Integrate into existing `pnpm fio:sync` script
- Picked up by hourly cron job in `.do/dev.kawakawa.cx.yaml`

### Deliverables

- [ ] FIO price data parser
- [ ] sync-exchange-prices.ts service with tests
- [ ] Sync controller endpoints
- [ ] fio_exchanges seed data
- [ ] FIO sync UI components
- [ ] Price field setting
- [ ] CLI script integration (`fio:sync:prices`)

---

## Phase 5: Price Display & Integration

### Backend

#### 5.1 Effective Price Calculator

`apps/api/src/services/price-calculator.ts`:

```typescript
interface AppliedAdjustment {
  id: number
  description: string
  type: 'percentage' | 'fixed'
  value: number
  appliedAmount: number // Actual change in price units
}

interface EffectivePrice {
  exchangeCode: string
  commodityTicker: string
  locationId: string
  currency: Currency
  basePrice: number
  source: PriceSource
  sourceReference: string | null
  adjustments: AppliedAdjustment[]
  finalPrice: number
}

function calculateEffectivePrice(
  exchange: string,
  ticker: string,
  locationId: string,
  currency: Currency
): EffectivePrice | null

function calculateEffectivePrices(
  exchange: string,
  locationId: string,
  currency: Currency
): EffectivePrice[]
```

**Adjustment Application Order:**

1. Sort adjustments by priority (ascending)
2. For each adjustment matching (exchange, ticker, location, currency) - NULL fields match anything:
   - Percentage: `price = price * (1 + value/100)`
   - Fixed: `price = price + value`
3. Round final price to 2 decimal places

#### 5.2 Market Integration

Update `MarketController.getMarketListings()`:

- Add optional `includeReferencePrice` query param
- If true, include `referencePrice` field from price_lists
- Add `priceDifference` field (user price vs reference)

#### 5.3 Order Dialog Integration

- When user selects commodity + location, fetch effective price
- Show as "Suggested: X CIS (KAWA list)" hint
- "Use Suggested" button to auto-fill price

### Frontend

#### 5.4 Price List View

`apps/web/src/views/PriceListView.vue`:

**Layout:**

- Exchange selector (tabs: KAWA, CI1, NC1, IC1, AI1)
- Location selector (dropdown - varies by exchange: KAWA has many, FIO exchanges have one)
- Currency selector
- Search/filter by ticker or category

**Table Columns:**
| Ticker | Name | Category | Base Price | Adjustments | Final Price | Source | Updated |
|--------|------|----------|------------|-------------|-------------|--------|---------|

**Features:**

- Click row to edit price (if source is manual/csv_import)
- Bulk import buttons (CSV, Google Sheets) - for KAWA exchange
- FIO sync button - for FIO exchanges (CI1, NC1, etc.)
- Export dropdown:
  - "Export Base Prices (CSV)" - raw prices without adjustments
  - "Export Effective Prices (CSV)" - prices with all adjustments applied

#### 5.5 Price Adjustments View

`apps/web/src/views/PriceAdjustmentsView.vue`:

**Table Columns:**
| Exchange | Location | Commodity | Type | Value | Priority | Description | Active | Actions |

**Features:**

- Filter by exchange and/or location
- Add/Edit/Delete adjustments
- Toggle active status
- Show affected price count

#### 5.6 Order Dialog Updates

`apps/web/src/components/OrderDialog.vue`:

- Add price suggestion display below price input
- Show source of suggestion (KAWA, FIO exchange)
- "Use Suggested" button
- Visual indicator if user price differs significantly from reference

### Deliverables

- [ ] Price calculator service with comprehensive tests
- [ ] MarketController reference price integration
- [ ] PriceListView.vue with export functionality
- [ ] PriceAdjustmentsView.vue (with effective_from/until support)
- [ ] OrderDialog.vue price suggestion feature
- [ ] Navigation updates for new views
- [ ] CSV export endpoints (base + effective prices)

---

## Phase Summary

| Phase | Focus           | Estimated Scope                  |
| ----- | --------------- | -------------------------------- |
| **1** | Foundation      | Schema, CRUD APIs, core logic    |
| **2** | CSV Import      | File upload, mapping, validation |
| **3** | Google Sheets   | URL parsing, saved configs       |
| **4** | FIO Integration | Exchange sync from FIO API       |
| **5** | Integration     | Display views, order suggestions |

### Implementation Order

```
Phase 1 (required first)
    ↓
┌───┴───┬───────┐
↓       ↓       ↓
Phase 2 Phase 3 Phase 4  (can be parallel)
└───────┴───┬───┘
            ↓
         Phase 5
```

### New Permissions

| Permission              | Description                          |
| ----------------------- | ------------------------------------ |
| `prices.view`           | View price lists                     |
| `prices.manage`         | Create/update/delete prices manually |
| `prices.import`         | Import from CSV/Google Sheets        |
| `prices.sync_fio`       | Trigger FIO price sync               |
| `adjustments.view`      | View price adjustments               |
| `adjustments.manage`    | Create/update/delete adjustments     |
| `import_configs.manage` | Manage saved import configurations   |

---

## Design Decisions (Resolved)

1. **Price history**: No - with 400+ commodities across exchanges, data would grow too large.

2. **Multi-currency handling**: No currency conversion. Show prices in exchange's default currency. KAWA defaults to CIS (configurable via settings).

3. **Adjustment effective dates**: Yes - add `effective_from` and `effective_until` columns.

4. **FIO sync schedule**: Add to `fio:sync` script - picked up by existing hourly cron job (see `.do/dev.kawakawa.cx.yaml`).

5. **Import conflicts**: Always overwrite existing prices on import.

6. **Export feature**: Support export for both base prices and effective prices (with adjustments applied).

---

## Technical Notes

### Location Examples

- **Stations**: BEN, MOR, ANT, HRT (FIO exchanges)
- **Planets**: UV-351a (Katoa), Proxion, etc. (KAWA production locations)

### FIO Exchange Mapping

| Code | Station | Currency | Notes           |
| ---- | ------- | -------- | --------------- |
| CI1  | BEN     | CIS      | Benton, default |
| NC1  | MOR     | NCC      | Moria           |
| IC1  | ANT     | ICA      | Antares         |
| AI1  | HRT     | AIC      | Hortus          |

### Adjustment Examples

1. **Global 10% KAWA markup**: All KAWA prices get 10% added
   - `exchange='KAWA', ticker=NULL, location=NULL, type=percentage, value=10`

2. **Proxion H2O discount**: Local production means cheaper water on KAWA
   - `exchange='KAWA', ticker='H2O', location='UV-351a', type=percentage, value=-20`

3. **BEN shipping surcharge**: All prices at BEN (any exchange) get station fees
   - `exchange=NULL, ticker=NULL, location='BEN', type=fixed, value=50`

4. **CI1 markup**: Additional fee for using CI1 exchange
   - `exchange='CI1', ticker=NULL, location=NULL, type=percentage, value=5`
