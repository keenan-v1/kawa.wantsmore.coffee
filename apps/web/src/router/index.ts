import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import RegisterView from '../views/RegisterView.vue'
import ResetPasswordView from '../views/ResetPasswordView.vue'
import DiscordCallbackView from '../views/DiscordCallbackView.vue'
import TermsView from '../views/TermsView.vue'
import PrivacyView from '../views/PrivacyView.vue'
import UnverifiedView from '../views/UnverifiedView.vue'
import MarketView from '../views/MarketView.vue'
import InventoryView from '../views/InventoryView.vue'
import MyOrdersView from '../views/MyOrdersView.vue'
import AccountView from '../views/AccountView.vue'
import AdminView from '../views/AdminView.vue'
import NotificationsView from '../views/NotificationsView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/market',
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
    },
    {
      path: '/register',
      name: 'register',
      component: RegisterView,
    },
    {
      path: '/reset-password',
      name: 'reset-password',
      component: ResetPasswordView,
    },
    {
      path: '/discord/callback',
      name: 'discord-callback',
      component: DiscordCallbackView,
    },
    {
      path: '/terms',
      name: 'terms',
      component: TermsView,
    },
    {
      path: '/privacy',
      name: 'privacy',
      component: PrivacyView,
    },
    {
      path: '/pending',
      name: 'pending',
      component: UnverifiedView,
      meta: { requiresAuth: true },
    },
    {
      path: '/market',
      name: 'market',
      component: MarketView,
      meta: { requiresAuth: true, requiresVerified: true },
    },
    {
      path: '/inventory',
      name: 'inventory',
      component: InventoryView,
      meta: { requiresAuth: true, requiresVerified: true },
    },
    {
      path: '/orders',
      name: 'my-orders',
      component: MyOrdersView,
      meta: { requiresAuth: true, requiresVerified: true },
    },
    {
      path: '/account',
      name: 'account',
      component: AccountView,
      meta: { requiresAuth: true, requiresVerified: true },
    },
    {
      path: '/notifications',
      name: 'notifications',
      component: NotificationsView,
      meta: { requiresAuth: true, requiresVerified: true },
    },
    {
      path: '/admin',
      name: 'admin',
      component: AdminView,
      meta: { requiresAuth: true, requiresVerified: true, requiresAdmin: true },
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/market',
    },
  ],
})

// Helper to check if user has a role
const hasRole = (roleId: string): boolean => {
  const userStr = localStorage.getItem('user')
  if (!userStr) return false
  try {
    const user = JSON.parse(userStr)
    return user.roles?.some((r: { id: string }) => r.id === roleId) ?? false
  } catch {
    return false
  }
}

// Check if user is verified (has any role other than 'unverified')
const isVerified = (): boolean => {
  const userStr = localStorage.getItem('user')
  if (!userStr) return false
  try {
    const user = JSON.parse(userStr)
    // User is verified if they have any role that isn't 'unverified'
    return user.roles?.some((r: { id: string }) => r.id !== 'unverified') ?? false
  } catch {
    return false
  }
}

// Navigation guard for authentication and authorization
router.beforeEach((to, _from, next) => {
  const jwt = localStorage.getItem('jwt')

  if (to.meta.requiresAuth && !jwt) {
    // Save the intended destination for post-login redirect
    const redirectPath = to.fullPath !== '/login' ? to.fullPath : '/market'
    next({
      path: '/login',
      query: { redirect: redirectPath },
    })
  } else if (to.meta.requiresVerified && !isVerified()) {
    // Redirect unverified users to pending page
    next({ path: '/pending' })
  } else if (to.meta.requiresAdmin && !hasRole('administrator')) {
    // Redirect non-admins away from admin pages
    next({ path: '/market' })
  } else {
    next()
  }
})

export default router
