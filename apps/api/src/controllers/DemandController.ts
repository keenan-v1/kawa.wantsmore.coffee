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

interface Demand {
  id: number
  commodity: string
  quantity: number
  maxPrice: number
  currency: Currency
  deliveryLocation: string
}

interface CreateDemandRequest {
  commodity: string
  quantity: number
  maxPrice: number
  currency: Currency
  deliveryLocation: string
}

interface UpdateDemandRequest {
  quantity?: number
  maxPrice?: number
  currency?: Currency
  deliveryLocation?: string
}

@Route('demands')
@Tags('Demands')
@Security('jwt')
export class DemandController extends Controller {
  @Get()
  public async getDemands(): Promise<Demand[]> {
    // TODO: Implement database query
    return []
  }

  @Get('{id}')
  public async getDemand(@Path() id: number): Promise<Demand | null> {
    // TODO: Implement database query
    return null
  }

  @Post()
  @SuccessResponse('201', 'Created')
  public async createDemand(@Body() body: CreateDemandRequest): Promise<Demand> {
    this.setStatus(201)
    // TODO: Implement database insert
    return {
      id: 1,
      ...body,
    }
  }

  @Put('{id}')
  public async updateDemand(
    @Path() id: number,
    @Body() body: UpdateDemandRequest
  ): Promise<Demand | null> {
    // TODO: Implement database update
    return null
  }

  @Delete('{id}')
  @SuccessResponse('204', 'Deleted')
  public async deleteDemand(@Path() id: number): Promise<void> {
    this.setStatus(204)
    // TODO: Implement database delete
  }
}
