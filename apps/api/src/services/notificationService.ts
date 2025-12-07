// Notification Service - Create and manage user notifications
import { db, notifications } from '../db/index.js'
import { eq, desc, and, sql } from 'drizzle-orm'
import type { Notification, NotificationType } from '@kawakawa/types'

/**
 * Create a notification for a user
 */
export async function create(
  userId: number,
  type: NotificationType,
  title: string,
  message?: string,
  data?: Record<string, unknown>
): Promise<Notification> {
  const [notification] = await db
    .insert(notifications)
    .values({
      userId,
      type,
      title,
      message: message ?? null,
      data: data ?? null,
    })
    .returning()

  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    data: notification.data as Record<string, unknown> | null,
    isRead: notification.isRead,
    createdAt: notification.createdAt.toISOString(),
  }
}

/**
 * Create notifications for multiple users (e.g., all admins)
 */
export async function createForMany(
  userIds: number[],
  type: NotificationType,
  title: string,
  message?: string,
  data?: Record<string, unknown>
): Promise<void> {
  if (userIds.length === 0) return

  await db.insert(notifications).values(
    userIds.map(userId => ({
      userId,
      type,
      title,
      message: message ?? null,
      data: data ?? null,
    }))
  )
}

/**
 * Get notifications for a user
 */
export async function getForUser(
  userId: number,
  options?: { limit?: number; offset?: number; unreadOnly?: boolean }
): Promise<Notification[]> {
  const { limit = 50, offset = 0, unreadOnly = false } = options ?? {}

  const conditions = [eq(notifications.userId, userId)]
  if (unreadOnly) {
    conditions.push(eq(notifications.isRead, false))
  }

  const rows = await db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
    .offset(offset)

  return rows.map(row => ({
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    data: row.data as Record<string, unknown> | null,
    isRead: row.isRead,
    createdAt: row.createdAt.toISOString(),
  }))
}

/**
 * Get unread count for a user
 */
export async function getUnreadCount(userId: number): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)))

  return result[0]?.count ?? 0
}

/**
 * Mark a notification as read
 */
export async function markAsRead(id: number, userId: number): Promise<boolean> {
  const result = await db
    .update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .returning({ id: notifications.id })

  return result.length > 0
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllAsRead(userId: number): Promise<number> {
  const result = await db
    .update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)))
    .returning({ id: notifications.id })

  return result.length
}

/**
 * Delete a notification
 */
export async function remove(id: number, userId: number): Promise<boolean> {
  const result = await db
    .delete(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .returning({ id: notifications.id })

  return result.length > 0
}

/**
 * Get a single notification by ID (for the user)
 */
export async function getById(id: number, userId: number): Promise<Notification | null> {
  const [row] = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))

  if (!row) return null

  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    data: row.data as Record<string, unknown> | null,
    isRead: row.isRead,
    createdAt: row.createdAt.toISOString(),
  }
}

// Export as namespace for cleaner imports
export const notificationService = {
  create,
  createForMany,
  getForUser,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  remove,
  getById,
}

export default notificationService
