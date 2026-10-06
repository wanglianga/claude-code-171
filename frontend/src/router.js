import { createRouter, createWebHistory } from 'vue-router';
import { store } from './api.js';
import Login from './views/Login.vue';
import Dashboard from './views/Dashboard.vue';
import Products from './views/Products.vue';
import Live from './views/Live.vue';
import Fulfill from './views/Fulfill.vue';
import AfterSales from './views/AfterSales.vue';
import Trace from './views/Trace.vue';
import Insights from './views/Insights.vue';
import Brand from './views/Brand.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: Login, meta: { public: true } },
    { path: '/', component: Dashboard },
    { path: '/products', component: Products },
    { path: '/live', component: Live },
    { path: '/fulfill', component: Fulfill },
    { path: '/after-sales', component: AfterSales },
    { path: '/trace', component: Trace },
    { path: '/insights', component: Insights, meta: { roles: ['county', 'operator'] } },
    { path: '/brand', component: Brand, meta: { roles: ['county'] } },
  ],
});

router.beforeEach((to) => {
  if (to.meta.public) return true;
  if (!store.token) return '/login';
  if (to.meta.roles && !to.meta.roles.includes(store.user?.role)) return '/';
  return true;
});
