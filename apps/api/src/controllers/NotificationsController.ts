import {
  Controller,
  Delete,
  Get,
  Path,
  Put,
  Query,
  Route,
  Security,
  Tags,
  Request,
  SuccessResponse,
} from 'tsoa'
import type { Notification } from '@kawakawa/types'
import type { JwtPayload } from '../utils/jwt.js'
import { NotFound } from '../utils/errors.js'
import { notificationService } from '../services/notificationService.js'

@Route('notifications')
@Tags('Notifications')
@Security('jwt')
export class NotificationsController extends Controller {
  /**
   * Get notifications for the current user
   * @param limit Maximum number of notifications to return (default 50)
   * @param offset Number of notifications to skip (default 0)
   * @param unreadOnly Only return unread notifications (default false)
   */
  @Get()
  public async getNotifications(
    @Request() request: { user: JwtPayload },
    @Query() limit?: number,
    @Query() offset?: number,
    @Query() unreadOnly?: boolean
  ): Promise<Notification[]> {
    const userId = request.user.userId
    return notificationService.getForUser(userId, {
      limit: limit ?? 50,
      offset: offset ?? 0,
      unreadOnly: unreadOnly ?? false,
    })
  }

  /**
   * Get a specific notification by ID
   */
  @Get('{id}')
  public async getNotification(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<Notification> {
    const userId = request.user.userId
    const notification = await notificationService.getById(id, userId)

    if (!notification) {
      throw NotFound('Notification not found')
    }

    return notification
  }

  /**
   * Mark a notification as read
   */
  @Put('{id}/read')
  @SuccessResponse(204, 'Notification marked as read')
  public async markAsRead(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<void> {
    const userId = request.user.userId
    const success = await notificationService.markAsRead(id, userId)

    if (!success) {
      throw NotFound('Notification not found')
    }

    this.setStatus(204)
  }

  /**
   * Mark all notifications as read
   */
  @Put('read-all')
  @SuccessResponse(200, 'All notifications marked as read')
  public async markAllAsRead(@Request() request: { user: JwtPayload }): Promise<{ count: number }> {
    const userId = request.user.userId
    const count = await notificationService.markAllAsRead(userId)
    return { count }
  }

  /**
   * Delete a notification
   */
  @Delete('{id}')
  @SuccessResponse(204, 'Notification deleted')
  public async deleteNotification(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<void> {
    const userId = request.user.userId
    const success = await notificationService.remove(id, userId)

    if (!success) {
      throw NotFound('Notification not found')
    }

    this.setStatus(204)
  }
}
