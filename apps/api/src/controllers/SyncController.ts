import { Controller, Get, Route, Security, Tags, Request } from 'tsoa'
import type { SyncState } from '@kawakawa/types'
import type { JwtPayload } from '../utils/jwt.js'
import { syncService } from '../services/syncService.js'

@Route('sync')
@Tags('Sync')
@Security('jwt')
export class SyncController extends Controller {
  /**
   * Get sync state including unread count, app version, and data versions
   * Used for polling to detect app updates and cache invalidation
   */
  @Get('state')
  public async getSyncState(@Request() request: { user: JwtPayload }): Promise<SyncState> {
    const userId = request.user.userId
    return syncService.getSyncState(userId)
  }
}
