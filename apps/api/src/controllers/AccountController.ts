import { Body, Controller, Get, Put, Route, Security, Tags } from 'tsoa'
import type { Currency, LocationDisplayMode, CommodityDisplayMode, Role } from '@kawakawa/types'

interface UserProfile {
  profileName: string
  displayName: string
  fioUsername: string
  preferredCurrency: Currency
  locationDisplayMode: LocationDisplayMode
  commodityDisplayMode: CommodityDisplayMode
  roles: Role[]
}

interface UpdateProfileRequest {
  displayName?: string
  fioUsername?: string
  preferredCurrency?: Currency
  locationDisplayMode?: LocationDisplayMode
  commodityDisplayMode?: CommodityDisplayMode
}

interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
}

@Route('account')
@Tags('Account')
@Security('jwt')
export class AccountController extends Controller {
  @Get()
  public async getProfile(): Promise<UserProfile> {
    // TODO: Get from JWT and database
    return {
      profileName: '',
      displayName: '',
      fioUsername: '',
      preferredCurrency: 'CIS',
      locationDisplayMode: 'both',
      commodityDisplayMode: 'both',
      roles: [],
    }
  }

  @Put()
  public async updateProfile(@Body() body: UpdateProfileRequest): Promise<UserProfile> {
    // TODO: Update in database
    return {
      profileName: '',
      displayName: body.displayName || '',
      fioUsername: body.fioUsername || '',
      preferredCurrency: body.preferredCurrency || 'CIS',
      locationDisplayMode: body.locationDisplayMode || 'both',
      commodityDisplayMode: body.commodityDisplayMode || 'both',
      roles: [],
    }
  }

  @Put('password')
  public async changePassword(@Body() body: ChangePasswordRequest): Promise<{ success: boolean }> {
    // TODO: Validate current password and update
    return { success: true }
  }
}
