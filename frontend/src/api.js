import { reactive } from 'vue';

export const store = reactive({
  token: localStorage.getItem('token') || '',
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  setAuth(token, user) {
    this.token = token;
    this.user = user;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  },
  logout() {
    this.token = '';
    this.user = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },
});

async function request(method, url, body) {
  const res = await fetch(`/api${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(store.token ? { Authorization: `Bearer ${store.token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = Array.isArray(data?.message) ? data.message.join('；') : data?.message || `请求失败 (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body || {}),
};

export const ROLE_LABEL = {
  county: '县域运营方', operator: '选品运营', warehouse: '仓库', service: '售后客服', farmer: '农户/合作社',
};

export const REASON_LABEL = {
  bad_fruit: '坏果', short: '少发', delay: '物流延误',
  wrong_address: '地址错误', rejected: '用户拒收', taste_mismatch: '口味不符',
};
