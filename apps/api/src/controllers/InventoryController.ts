import {
  Body,
  Controller,
  Delete,
  Get,
  Path,
  Post,
  Put,
  Route,
  Security,
  Tags,
  SuccessResponse,
} from 'tsoa'
import type { Currency } from '@kawakawa/types'

interface InventoryItem {
  id: number
  commodity: string
  quantity: number
  price: number
  currency: Currency
  location: string
}

interface CreateInventoryRequest {
  commodity: string
  quantity: number
  price: number
  currency: Currency
  location: string
}

interface UpdateInventoryRequest {
  quantity?: number
  price?: number
  currency?: Currency
  location?: string
}

@Route('inventory')
@Tags('Inventory')
@Security('jwt')
export class InventoryController extends Controller {
  @Get()
  public async getInventory(): Promise<InventoryItem[]> {
    // TODO: Implement database query
    return []
  }

  @Get('{id}')
  public async getInventoryItem(@Path() id: number): Promise<InventoryItem | null> {
    // TODO: Implement database query
    return null
  }

  @Post()
  @SuccessResponse('201', 'Created')
  public async createInventoryItem(@Body() body: CreateInventoryRequest): Promise<InventoryItem> {
    this.setStatus(201)
    // TODO: Implement database insert
    return {
      id: 1,
      ...body,
    }
  }

  @Put('{id}')
  public async updateInventoryItem(
    @Path() id: number,
    @Body() body: UpdateInventoryRequest
  ): Promise<InventoryItem | null> {
    // TODO: Implement database update
    return null
  }

  @Delete('{id}')
  @SuccessResponse('204', 'Deleted')
  public async deleteInventoryItem(@Path() id: number): Promise<void> {
    this.setStatus(204)
    // TODO: Implement database delete
  }
}
