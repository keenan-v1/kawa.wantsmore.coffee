// FIO API Types based on Swagger spec

export interface FioMaterial {
  MaterialId: string // Ticker like "H2O", "FE", etc.
  CategoryName: string // "agricultural products", "metals", etc.
  CategoryId: string
  Name: string
  Ticker: string
  Weight: number
  Volume: number
  UserNameSubmitted: string
  Timestamp: string
}

export interface FioPlanet {
  PlanetId: string
  PlanetNaturalId: string // Natural ID like "UV-351a"
  PlanetName: string
  Namer: string | null
  NamingDataEpochMs: number
  Nameable: boolean
  SystemId: string
  Gravity: number
  MagneticField: number
  Mass: number
  MassEarth: number
  OrbitSemiMajorAxis: number
  OrbitEccentricity: number
  OrbitInclination: number
  OrbitRightAscension: number
  OrbitPeriapsis: number
  OrbitIndex: number
  Radius: number
  Sunlight: number
  Surface: boolean
  Temperature: number
  Fertility: number
  HasLocalMarket: boolean
  HasChamberOfCommerce: boolean
  HasWarehouse: boolean
  HasAdministrationCenter: boolean
  HasShipyard: boolean
  FactionCode: string | null
  FactionName: string | null
  GovernorId: string | null
  GovernorUserName: string | null
  GovernorCorporationId: string | null
  GovernorCorporationName: string | null
  GovernorCorporationCode: string | null
  CurrencyName: string | null
  CurrencyCode: string | null
  CollectorId: string | null
  CollectorName: string | null
  CollectorCode: string | null
  BaseAttackProtection: number
  UserNameSubmitted: string
  Timestamp: string
}

export interface FioSystem {
  SystemId: string
  NaturalId: string // Natural ID like "UV-351"
  Name: string
  Type: string
  PositionX: number
  PositionY: number
  PositionZ: number
  SectorId: string
  SubSectorId: string
  UserNameSubmitted: string
  Timestamp: string
}

export interface FioOrder {
  OrderId: string
  CompanyId: string
  CompanyName: string
  CompanyCode: string
  ItemCount: number
  ItemCost: number
  MaterialId: string
  MaterialName: string
  MaterialTicker: string
  MaterialCategory: string
  MaterialWeight: number
  MaterialVolume: number
  ExchangeCode: string // "IC1", "NC1", etc.
  ExchangeName: string
  MMBuy: number
  MMSell: number
  PriceAverage: number
  PriceAsk: number
  PriceBid: number
  SupplyAverage: number
  SupplyDemand: number
  UserNameSubmitted: string
  Timestamp: string
}

export interface FioBuilding {
  BuildingId: string
  Name: string
  Ticker: string
  Expertise: string | null
  Pioneers: number
  Settlers: number
  Technicians: number
  Engineers: number
  Scientists: number
  AreaCost: number
  UserNameSubmitted: string
  Timestamp: string
  BuildingCosts?: FioBuildingCost[]
  Recipes?: FioRecipe[]
}

export interface FioBuildingCost {
  MaterialId: string
  MaterialName: string
  MaterialTicker: string
  MaterialCategory: string
  Amount: number
}

export interface FioRecipe {
  RecipeId: string
  BuildingTicker: string
  RecipeName: string
  StandardRecipeName: string
  Inputs: FioRecipeIO[]
  Outputs: FioRecipeIO[]
  TimeMs: number
  UserNameSubmitted: string
  Timestamp: string
}

export interface FioRecipeIO {
  MaterialId: string
  MaterialName: string
  MaterialTicker: string
  MaterialCategory: string
  Amount: number
}

export interface FioPrice {
  MaterialId: string
  MaterialTicker: string
  MaterialName: string
  ExchangeCode: string
  MMBuy: number | null
  MMSell: number | null
  PriceAverage: number | null
  PriceAsk: number | null
  PriceBid: number | null
  SupplyAverage: number | null
  DemandAverage: number | null
  Traded: number | null
  VolumeAmount: number | null
  PriceTimeEpochMs: number
  UserNameSubmitted: string
  Timestamp: string
}
