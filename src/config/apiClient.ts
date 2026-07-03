import axios from 'axios';

// Set global defaults for all axios requests
axios.defaults.withCredentials = true;
axios.defaults.timeout = 30000;

// Global response interceptor for auth errors
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }
    return Promise.reject(error);
  }
);

export { axios };
