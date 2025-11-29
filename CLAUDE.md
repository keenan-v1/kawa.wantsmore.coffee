# KawaKawa Market

## Project Overview

Frontend for KawaKawa, Inc.'s internal commodity market. KawaKawa is a fictional corporation in the game **Prosperous Universe**. While the game has public commodity exchanges, this website serves the corporation's internal market where members coordinate and keep prices fixed.

## Tech Stack

- **Vue 3** with **TypeScript**
- **Vite** as build tool
- **Vuetify** for UI components
- **Dev container**

## Phases

### Phase 1

#### Front End

- Account logins and registration
- Account management
- Available inventory management
- Demand management
- List inventories of participating members with pricing

#### Back End

- FIO integration
- Google Sheets integration (KAWA Price data)
- Inventory management
- Account management

### Phase 2

#### Front End & Back End

- Burn tracking & Configure what bases to include or exclude
- Consumable and Input supply and demand reporting based on Burn and inventory

## Development

```bash
npm run dev     # Start dev server on port 5173
npm run build   # Production build
```

## Project Structure

```
src/
├── plugins/vuetify.ts   # Vuetify configuration (dark theme)
├── App.vue              # Root component
└── main.ts              # App entry point
```
