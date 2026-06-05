import axios from 'axios';

/** Send httpOnly auth cookies on all API requests. */
axios.defaults.withCredentials = true;

export { axios };
