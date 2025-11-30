import { Controller, Get, Route, Tags } from 'tsoa'
import type { Currency } from '@kawakawa/types'

interface MarketListing {
  id: number
  commodity: string
  seller: string
  quantity: number
  price: number
  currency: Currency
  location: string
}

@Route('market')
@Tags('Market')
export class MarketController extends Controller {
  @Get()
  public async getMarketListings(): Promise<MarketListing[]> {
    // TODO: Aggregate inventory from all users
    return []
  }
}
