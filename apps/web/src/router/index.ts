import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import RegisterView from '../views/RegisterView.vue'
import MarketView from '../views/MarketView.vue'
import InventoryView from '../views/InventoryView.vue'
import DemandView from '../views/DemandView.vue'
import AccountView from '../views/AccountView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/market'
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView
    },
    {
      path: '/register',
      name: 'register',
      component: RegisterView
    },
    {
      path: '/market',
      name: 'market',
      component: MarketView,
      meta: { requiresAuth: true }
    },
    {
      path: '/inventory',
      name: 'inventory',
      component: InventoryView,
      meta: { requiresAuth: true }
    },
    {
      path: '/demand',
      name: 'demand',
      component: DemandView,
      meta: { requiresAuth: true }
    },
    {
      path: '/account',
      name: 'account',
      component: AccountView,
      meta: { requiresAuth: true }
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/market'
    }
  ]
})

// Navigation guard for authentication
router.beforeEach((to, _from, next) => {
  const jwt = localStorage.getItem('jwt')

  if (to.meta.requiresAuth && !jwt) {
    // Save the intended destination for post-login redirect
    const redirectPath = to.fullPath !== '/login' ? to.fullPath : '/market'
    next({
      path: '/login',
      query: { redirect: redirectPath }
    })
  } else {
    next()
  }
})

export default router
