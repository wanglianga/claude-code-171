import axios from 'axios';
import { ElMessage } from 'element-plus';
import router from '../router';

const request = axios.create({ baseURL: '/api', timeout: 15000 });

request.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

request.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const msg = err.response?.data?.message || err.message || '请求失败';
    ElMessage.error(Array.isArray(msg) ? msg[0] : msg);
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      router.push('/login');
    }
    return Promise.reject(err);
  },
);

export default request;
