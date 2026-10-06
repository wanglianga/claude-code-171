import { defineStore } from 'pinia';
import request from '../api/request';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('token') || '',
    user: JSON.parse(localStorage.getItem('user') || 'null'),
  }),
  getters: {
    isLoggedIn: (s) => !!s.token,
    role: (s) => s.user?.role || '',
    roleName: (s) => {
      const map = { admin: '平台管理员', operator: '运营人员', farmer: '农户/合作社', warehouse: '仓库管理', aftersales: '售后专员' };
      return map[s.user?.role] || '';
    },
  },
  actions: {
    async login(username, password) {
      const data = await request.post('/auth/login', { username, password });
      this.token = data.token;
      this.user = data.user;
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
    },
    logout() {
      this.token = '';
      this.user = null;
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    },
  },
});
